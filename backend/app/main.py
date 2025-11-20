from typing import List, Dict, Optional, Tuple
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import random
import string
import winrm
import os
import json
from datetime import datetime, timedelta, timezone


app = FastAPI(title="WinRM Admin API", version="0.1.0")

# Allow browser access (frontend runs on 5173)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ConnectBody(BaseModel):
    host: str = Field(..., description="Windows host/IP")
    # Username/password are optional; default to env (fixed credentials)
    username: Optional[str] = Field(default=None, description="Username with admin privileges")
    password: Optional[str] = Field(default=None, description="Password")
    use_https: bool = True
    port: int = 5986
    ignore_cert: bool = True


class PasswordChangeBody(ConnectBody):
    users: List[str] = Field(default_factory=list)
    auto_generate: bool = True
    # Optional map to set specific passwords per user when auto_generate is False
    passwords: Optional[Dict[str, str]] = None


class RenameUsersBody(ConnectBody):
    current_names: List[str] = Field(default_factory=list)
    new_names: List[str] = Field(default_factory=list)


class ShutdownEvent(BaseModel):
    status: str
    time: Optional[str] = None
    user: Optional[str] = None
    message: Optional[str] = None


class RDPConnectionsBody(ConnectBody):
    mode: int = Field(..., description="1=Buscar por IP en últimos N días, 2=Listar todo, 3=Buscar por IP en últimas N horas")
    ip_address: Optional[str] = Field(default=None, description="Dirección IP a verificar (requerida en modos 1 y 3)")
    days: int = Field(default=7, description="Cantidad de días de historial a revisar")
    hours: int = Field(default=1, description="Cantidad de horas para modo 3")


def generate_password() -> str:
    # Mirrors PowerShell logic: at least 1 of each type, length >= 8, avoid starting with '='
    uppercase = [chr(c) for c in range(65, 91)]  # A-Z
    lowercase = [chr(c) for c in range(97, 123)]  # a-z
    digits = [chr(c) for c in range(48, 58)]  # 0-9
    specials = list("!@#$%^&*()-_=+")

    while True:
        pw_chars = [
            random.choice(uppercase),
            random.choice(lowercase),
            random.choice(digits),
            random.choice(specials),
        ]
        pool = uppercase + lowercase + digits + specials
        while len(pw_chars) < 8:
            pw_chars.append(random.choice(pool))
        random.shuffle(pw_chars)
        pwd = "".join(pw_chars)
        if not pwd.startswith("="):
            return pwd


def _get_creds(fallback_user: Optional[str], fallback_pass: Optional[str]):
    user = fallback_user or os.getenv("WINRM_USERNAME")
    pwd = fallback_pass or os.getenv("WINRM_PASSWORD")
    if not user or not pwd:
        raise HTTPException(status_code=400, detail="Credenciales no configuradas. Defina WINRM_USERNAME y WINRM_PASSWORD.")
    return user, pwd


def run_ps(host: str, username: Optional[str], password: Optional[str], script: str, *, use_https=True, port=5986, ignore_cert=True):
    try:
        user, pwd = _get_creds(username, password)
        # Configure WinRM session
        opts = {
            "server_cert_validation": "ignore" if ignore_cert else "validate",
            "transport": "ntlm",  # fallback option; Basic also works if allowed
        }
        protocol = "https" if use_https else "http"
        endpoint = f"{protocol}://{host}:{port}/wsman"
        session = winrm.Session(target=endpoint, auth=(user, pwd), **opts)
        result = session.run_ps(script)
        if result.status_code != 0:
            raise HTTPException(status_code=400, detail=result.std_err.decode(errors="ignore") or "PowerShell error")
        return result.std_out.decode(errors="ignore")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/connect/test")
def connect_test(body: ConnectBody):
    # Return the hostname of the remote server
    ps = r"$env:COMPUTERNAME"
    out = run_ps(body.host, body.username, body.password, ps, use_https=body.use_https, port=body.port, ignore_cert=body.ignore_cert)
    hostname = out.strip()
    return {"ok": True, "hostname": hostname}


@app.post("/users/change-passwords")
def change_passwords(body: PasswordChangeBody):
    if not body.users:
        raise HTTPException(status_code=400, detail="Debe ingresar al menos un usuario")

    # Prepare username->password map
    user_pw: Dict[str, str] = {}
    if body.auto_generate:
        for u in body.users:
            user_pw[u] = generate_password()
    else:
        if not body.passwords:
            raise HTTPException(status_code=400, detail="Se requieren contraseñas cuando auto_generate es False")
        for u in body.users:
            if u not in body.passwords or not body.passwords[u]:
                raise HTTPException(status_code=400, detail=f"Falta contraseña para el usuario: {u}")
            user_pw[u] = body.passwords[u]

    # PowerShell script to set passwords
    # We pass a JSON-like here-string for simplicity and parse it in PS
    # but since PS doesn't parse JSON into hashtables natively without ConvertFrom-Json,
    # we build the hashtable inline in the script.
    payload = [{"user": user, "password": pwd} for user, pwd in user_pw.items()]
    payload_json = json.dumps(payload, ensure_ascii=False)
    ps = rf'''
    $entries = ConvertFrom-Json @'
{payload_json}
'@
    $result = @()
    foreach ($entry in $entries) {{
        $record = [ordered]@{{
            user = $entry.user
            password = $entry.password
            status = "changed"
            message = ""
        }}
        try {{
            $null = Get-LocalUser -Name $entry.user -ErrorAction Stop
            $secure = ConvertTo-SecureString -String $entry.password -AsPlainText -Force
            Set-LocalUser -Name $entry.user -Password $secure
        }} catch [Microsoft.PowerShell.Commands.UserNotFoundException] {{
            $record.status = "not_found"
            $record.message = $_.Exception.Message
        }} catch {{
            $record.status = "error"
            $record.message = $_.Exception.Message
        }}
        $result += [pscustomobject]$record
    }}
    $result | ConvertTo-Json -Compress
    '''

    out = run_ps(body.host, body.username, body.password, ps, use_https=body.use_https, port=body.port, ignore_cert=body.ignore_cert)

    try:
        raw_records = json.loads(out) if out else []
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail=f"Respuesta inesperada del host: {out}")

    if isinstance(raw_records, dict):
        raw_records = [raw_records]

    if not isinstance(raw_records, list):
        raise HTTPException(status_code=400, detail=f"Formato inesperado del host: {out}")

    def normalize_record(entry):
        if isinstance(entry, dict):
            return entry
        if isinstance(entry, str):
            stripped = entry.strip()
            if not stripped:
                return None
            try:
                nested = json.loads(stripped)
                if isinstance(nested, dict):
                    return nested
            except json.JSONDecodeError:
                pass
            if stripped.startswith("NO_ENCONTRADO:"):
                user = stripped.split(":", 1)[1]
                return {"user": user, "password": "", "status": "not_found", "message": ""}
            if stripped.startswith("ERROR:"):
                parts = stripped.split(":", 2)
                user = parts[1] if len(parts) > 1 else ""
                message = parts[2] if len(parts) > 2 else ""
                return {"user": user, "password": "", "status": "error", "message": message}
            pieces = stripped.split(" ", 1)
            if len(pieces) == 2:
                return {"user": pieces[0], "password": pieces[1], "status": "changed", "message": ""}
        return None

    normalized_records = []
    for entry in raw_records:
        normalized = normalize_record(entry)
        if normalized:
            normalized_records.append(normalized)

    changed: List[Dict[str, str]] = []
    failed: List[str] = []
    for rec in normalized_records:
        status = rec.get("status")
        user = rec.get("user", "")
        password = rec.get("password", "")
        message = rec.get("message", "")
        if status == "changed":
            changed.append({"user": user, "password": password})
        elif status == "not_found":
            failed.append(f"NO_ENCONTRADO:{user}")
        elif status == "error":
            failed.append(f"ERROR:{user}:{message}")
        else:
            failed.append(f"DESCONOCIDO:{user}:{message}")
    return {"ok": True, "changed": changed, "failed": failed}


@app.post("/users/count")
def count_local_users(body: ConnectBody):
    ps = r'''
    $excluidos = @("WDAGUtilityAccount", "administrator", "wavenet", "DefaultAccount", "Guest")
    try {
        $usuarios = Get-WmiObject Win32_UserAccount -ErrorAction Stop | Where-Object {
            $_.LocalAccount -eq $true -and
            $_.Disabled -eq $false -and
            $_.Name -notin $excluidos -and
            $_.Name -notlike "MSSQLSERVER*" -and
            $_.Name -notlike "SQLEXPRESS*" -and
            $_.Name -notlike "BEJERMAN*"
        }
        $cantidad = ($usuarios | Measure-Object).Count
        [pscustomobject]@{
            status = 'ok'
            count = $cantidad
            excluded = $excluidos
        } | ConvertTo-Json -Compress
    } catch {
        [pscustomobject]@{
            status = 'error'
            count = 0
            excluded = $excluidos
            message = $_.Exception.Message
        } | ConvertTo-Json -Compress
    }
    '''

    out = run_ps(body.host, body.username, body.password, ps, use_https=body.use_https, port=body.port, ignore_cert=body.ignore_cert)

    try:
        data = json.loads(out) if out else {}
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail=f"Respuesta inesperada del host: {out}")

    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail=f"Formato inesperado del host: {out}")

    if str(data.get("status")) != "ok":
        raise HTTPException(status_code=400, detail=data.get("message") or "No se pudo obtener la cantidad de usuarios.")

    count_value = data.get("count", 0)
    try:
        count_value = int(count_value)
    except (TypeError, ValueError):
        count_value = 0

    excluded_list = data.get("excluded") if isinstance(data.get("excluded"), list) else []

    return {"ok": True, "count": count_value, "excluded": excluded_list}


@app.post("/users/rename")
def rename_users(body: RenameUsersBody):
    if len(body.current_names) != len(body.new_names):
        raise HTTPException(status_code=400, detail="La cantidad de nombres actuales y nuevos no coincide")

    payload = [{"old": old, "new": new} for old, new in zip(body.current_names, body.new_names)]
    payload_json = json.dumps(payload, ensure_ascii=False)
    ps = rf'''
    $entries = ConvertFrom-Json @'
{payload_json}
'@
    $result = @()
    foreach ($entry in $entries) {{
        $record = [ordered]@{{
            old = $entry.old
            new = $entry.new
            status = "renamed"
            message = ""
        }}
        try {{
            $null = Get-LocalUser -Name $entry.old -ErrorAction Stop
            Rename-LocalUser -Name $entry.old -NewName $entry.new
            $textoAnterior = "Antes: $($entry.old)"
            Set-LocalUser -Name $entry.new -FullName $textoAnterior
        }} catch [Microsoft.PowerShell.Commands.UserNotFoundException] {{
            $record.status = "not_found"
            $record.message = $_.Exception.Message
        }} catch {{
            $record.status = "error"
            $record.message = $_.Exception.Message
        }}
        $result += [pscustomobject]$record
    }}
    $result | ConvertTo-Json -Compress
    '''

    out = run_ps(body.host, body.username, body.password, ps, use_https=body.use_https, port=body.port, ignore_cert=body.ignore_cert)

    try:
        raw_records = json.loads(out) if out else []
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail=f"Respuesta inesperada del host: {out}")

    if isinstance(raw_records, dict):
        raw_records = [raw_records]

    if not isinstance(raw_records, list):
        raise HTTPException(status_code=400, detail=f"Formato inesperado del host: {out}")

    def normalize_rename(entry):
        if isinstance(entry, dict):
            return entry
        if isinstance(entry, str):
            stripped = entry.strip()
            if not stripped:
                return None
            try:
                nested = json.loads(stripped)
                if isinstance(nested, dict):
                    return nested
            except json.JSONDecodeError:
                pass
            if stripped.startswith("NO_ENCONTRADO:"):
                old = stripped.split(":", 1)[1]
                return {"old": old, "new": "", "status": "not_found", "message": ""}
            if stripped.startswith("ERROR:"):
                parts = stripped.split(":", 2)
                old = parts[1] if len(parts) > 1 else ""
                message = parts[2] if len(parts) > 2 else ""
                return {"old": old, "new": "", "status": "error", "message": message}
            if "=>" in stripped:
                old, new = [segment.strip() for segment in stripped.split("=>", 1)]
                return {"old": old, "new": new, "status": "renamed", "message": ""}
        return None

    normalized_records = []
    for entry in raw_records:
        normalized = normalize_rename(entry)
        if normalized:
            normalized_records.append(normalized)

    renamed: List[str] = []
    failed: List[str] = []
    for rec in normalized_records:
        status = rec.get("status")
        old_name = rec.get("old", "")
        new_name = rec.get("new", "")
        message = rec.get("message", "")
        if status == "renamed":
            renamed.append(f"{old_name} => {new_name}")
        elif status == "not_found":
            failed.append(f"NO_ENCONTRADO:{old_name}")
        elif status == "error":
            failed.append(f"ERROR:{old_name}:{message}")
        else:
            failed.append(f"DESCONOCIDO:{old_name}:{message}")
    return {"ok": True, "renamed": renamed, "failed": failed}


@app.post("/system/last-shutdown")
def last_shutdown(body: ConnectBody):
    ps = r'''
    $filter = @{
        LogName = 'System'
        ID = 1074
    }
    $event = Get-WinEvent -FilterHashtable $filter -MaxEvents 1 -ErrorAction SilentlyContinue
    if ($event) {
        $userValue = $null
        if ($event.Properties.Count -gt 6) {
            $userValue = $event.Properties[6].Value
        }
        $payload = [ordered]@{
            status = 'found'
            time = $event.TimeCreated.ToUniversalTime().ToString('o')
            user = $userValue
            message = $event.Message
        }
    } else {
        $payload = [ordered]@{
            status = 'not_found'
            time = $null
            user = $null
            message = ''
        }
    }
    $payload | ConvertTo-Json -Compress
    '''

    out = run_ps(body.host, body.username, body.password, ps, use_https=body.use_https, port=body.port, ignore_cert=body.ignore_cert)

    try:
        data = json.loads(out) if out else {}
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail=f"Respuesta inesperada del host: {out}")

    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail=f"Formato inesperado del host: {out}")

    event = ShutdownEvent(
        status=str(data.get("status", "unknown")),
        time=data.get("time"),
        user=data.get("user"),
        message=data.get("message"),
    )

    return {"ok": True, "event": event.model_dump()}


def _run_rdp_script(body: ConnectBody, script: str, fallback_warning: str) -> Tuple[List[Dict[str, str]], List[str]]:
    out = run_ps(body.host, body.username, body.password, script, use_https=body.use_https, port=body.port, ignore_cert=body.ignore_cert)
    if not out or not out.strip():
        return [], [fallback_warning]
    try:
        data = json.loads(out)
    except json.JSONDecodeError:
        return [], [f"Respuesta inesperada del host: {out}"]
    warnings = data.get("warnings") if isinstance(data, dict) else []
    items = data.get("items") if isinstance(data, dict) else []
    if not isinstance(warnings, list):
        warnings = [str(warnings)]
    if not isinstance(items, list):
        items = []
    return items, [str(w) for w in warnings if w]


def _rdp_security_events(body: ConnectBody, days: int) -> Tuple[List[Dict[str, str]], List[str]]:
    script = f"""
$w=@()
try{{
    $ev=Get-WinEvent -FilterHashtable @{{LogName='Security';Id=4624;StartTime=(Get-Date).AddDays(-{days})}} -ErrorAction SilentlyContinue
}}catch{{
    $w+='Error log Security'
    $ev=@()
}}
$items=@()
foreach($e in $ev){{
    $x=[xml]$e.ToXml()
    $ip=($x.Event.EventData.Data|Where-Object {{$_.Name -eq 'IpAddress'}}|Select-Object -ExpandProperty '#text')
    if($ip -and $ip -notin @('::1','127.0.0.1')){{
        $user=($x.Event.EventData.Data|Where-Object {{$_.Name -eq 'TargetUserName'}}|Select-Object -ExpandProperty '#text')
        $items+=[pscustomobject]@{{IpAddress=$ip;Time=$e.TimeCreated.ToUniversalTime().ToString('o');User=$user;Source='Security'}}
    }}
}}
@{{warnings=$w;items=$items}}|ConvertTo-Json -Depth 4 -Compress
"""
    return _run_rdp_script(body, script, "No se pudo obtener eventos del log Security.")


def _rdp_remote_events(body: ConnectBody, days: int) -> Tuple[List[Dict[str, str]], List[str]]:
    script = f"""
$w=@()
try{{
    $ev=Get-WinEvent -FilterHashtable @{{LogName='Microsoft-Windows-TerminalServices-RemoteConnectionManager/Operational';Id=1149;StartTime=(Get-Date).AddDays(-{days})}} -ErrorAction Stop
}}catch{{
    $w+='Log RemoteConnectionManager no disponible'
    $ev=@()
}}
$items=@()
foreach($e in $ev){{
    $x=[xml]$e.ToXml()
    $ip=($x.Event.EventData.Data|Where-Object {{$_.Name -eq 'IpAddress'}}|Select-Object -ExpandProperty '#text')
    if($ip -and $ip -notin @('::1','127.0.0.1')){{
        $user=($x.Event.EventData.Data|Where-Object {{$_.Name -eq 'User'}}|Select-Object -ExpandProperty '#text')
        $items+=[pscustomobject]@{{IpAddress=$ip;Time=$e.TimeCreated.ToUniversalTime().ToString('o');User=$user;Source='RemoteConnectionManager'}}
    }}
}}
@{{warnings=$w;items=$items}}|ConvertTo-Json -Depth 4 -Compress
"""
    return _run_rdp_script(body, script, "No se pudo obtener eventos del log RemoteConnectionManager.")


def _rdp_active_sessions(body: ConnectBody) -> Tuple[List[Dict[str, str]], List[str]]:
    script = """
$w=@()
$items=@()
try{
    netstat -an 2>$null|Select-String ':3389'|ForEach-Object{
        if($_ -match 'TCP\s+([\d\.]+):\d+\s+([\d\.]+):3389\s+ESTABLISHED'){
            $ip=$matches[2]
            if($ip -ne '127.0.0.1'){
                $items+=[pscustomobject]@{IpAddress=$ip;Time=(Get-Date).ToUniversalTime().ToString('o');User='(desconocido)';Source='ActiveNetstat'}
            }
        }
    }
}catch{
    $w+='netstat no disponible'
}
try{
    $q=quser 2>$null
    if($q){
        for($i=1;$i -lt $q.Length;$i++){
            $line=$q[$i]
            if($line -match '^\s*([^\s]+)\s+([^\s]+)\s+(\d+)\s+([^\s]+)\s+([^\s]+)\s+(.*)$'){
                $items+=[pscustomobject]@{IpAddress='(IP no disponible en quser)';Time=(Get-Date).ToUniversalTime().ToString('o');User=$matches[1];Source='ActiveQUser'}
            }
        }
    }
}catch{
    $w+='quser no disponible'
}
@{warnings=$w;items=$items}|ConvertTo-Json -Depth 4 -Compress
"""
    return _run_rdp_script(body, script, "No se pudo obtener las sesiones activas.")


@app.post("/system/rdp-connections")
def rdp_connections(body: RDPConnectionsBody):
    if body.mode not in (1, 2, 3):
        raise HTTPException(status_code=400, detail="Modo inválido. Use 1, 2 o 3.")
    if body.mode in (1, 3) and not body.ip_address:
        raise HTTPException(status_code=400, detail="Debe especificar una dirección IP para el modo seleccionado.")
    if body.days <= 0:
        raise HTTPException(status_code=400, detail="El parámetro 'days' debe ser mayor que cero.")
    if body.hours <= 0:
        raise HTTPException(status_code=400, detail="El parámetro 'hours' debe ser mayor que cero.")

    security_items, security_warnings = _rdp_security_events(body, body.days)
    remote_items, remote_warnings = _rdp_remote_events(body, body.days)
    active_items, active_warnings = _rdp_active_sessions(body)

    warnings = security_warnings + remote_warnings + active_warnings

    combined: List[Dict[str, Optional[str]]] = []
    for raw in security_items + remote_items + active_items:
        if not isinstance(raw, dict):
            continue
        combined.append(
            {
                "IpAddress": str(raw.get("IpAddress", "")) if raw.get("IpAddress") is not None else "",
                "TimeCreated": raw.get("Time") or raw.get("TimeCreated"),
                "UserName": raw.get("User") or raw.get("UserName"),
                "SourceLog": raw.get("Source") or raw.get("SourceLog"),
            }
        )

    def _within_hours(item: Dict[str, Optional[str]]) -> bool:
        time_str = item.get("TimeCreated")
        if not time_str:
            return False
        try:
            cleaned = time_str.replace("Z", "+00:00")
            ts = datetime.fromisoformat(cleaned)
        except ValueError:
            return False
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        now_utc = datetime.now(timezone.utc)
        return ts >= now_utc - timedelta(hours=body.hours)

    filtered_items: List[Dict[str, Optional[str]]]
    if body.mode == 1:
        filtered_items = [item for item in combined if item.get("IpAddress") == body.ip_address]
        message = (
            f"La IP {body.ip_address} se detectó en el periodo consultado." if filtered_items else
            f"No se encontraron conexiones RDP desde la IP {body.ip_address} en los últimos {body.days} días ni en sesiones activas."
        )
    elif body.mode == 2:
        filtered_items = combined
        message = f"Resultados ordenados por fecha (últimos {body.days} días y sesiones activas)."
    else:
        filtered_items = [item for item in combined if item.get("IpAddress") == body.ip_address and _within_hours(item)]
        message = (
            f"La IP {body.ip_address} se conectó en las últimas {body.hours} horas o está activa."
            if filtered_items
            else f"La IP {body.ip_address} no se detectó en las últimas {body.hours} horas ni en sesiones activas."
        )

    filtered_items.sort(key=lambda item: item.get("TimeCreated") or "", reverse=True)

    return {
        "ok": True,
        "result": {
            "status": "ok",
            "mode": body.mode,
            "message": message,
            "warnings": warnings,
            "items": filtered_items,
        },
    }


@app.get("/health")
def health():
    return {"status": "ok"}
