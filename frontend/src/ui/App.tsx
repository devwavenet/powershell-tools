import { useEffect, useMemo, useState } from 'react'
import { isAxiosError } from 'axios'
import type { ConnectBody } from './api'
import {
  apiChangePasswords,
  apiConnect,
  apiLastShutdown,
  apiRdpConnections,
  apiRenameUsers,
  type RdpConnection,
  type RdpMode,
  type RdpQueryResponse,
  type ShutdownEvent,
} from './api'

type PasswordResult = {
  changed: { user: string; password: string }[]
  failed: string[]
}

type RenameResult = {
  renamed: string[]
  failed: string[]
}

const parseList = (input: string): string[] =>
  input
    .split(/[\s,;]+/)
    .map((item) => item.trim())
    .filter(Boolean)

const getErrorMessage = (error: unknown): string => {
  if (isAxiosError(error)) {
    const detail = (error.response?.data as { detail?: string; message?: string } | undefined)?.detail
    const message = (error.response?.data as { message?: string } | undefined)?.message
    return detail || message || error.message || 'Error de red'
  }
  if (error instanceof Error) {
    return error.message
  }
  return 'Ocurrió un error inesperado'
}

const downloadTextFile = (filename: string, lines: string[]) => {
  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

const normalizeString = (value?: string) => {
  if (!value) return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

const App = () => {
  const [connectForm, setConnectForm] = useState<ConnectBody>({
    host: '',
    use_https: true,
    port: 5986,
    ignore_cert: true,
  })
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)
  const [connectedHost, setConnectedHost] = useState<string | null>(null)
  const [hostname, setHostname] = useState<string | null>(null)

  const [activePanel, setActivePanel] = useState<'passwords' | 'rename' | 'shutdown' | 'rdp'>('passwords')

  const [usersInput, setUsersInput] = useState('')
  const usersList = useMemo(() => parseList(usersInput), [usersInput])
  const [autoGenerate, setAutoGenerate] = useState(true)
  const [manualPasswords, setManualPasswords] = useState<Record<string, string>>({})
  const [isChangingPasswords, setIsChangingPasswords] = useState(false)
  const [passwordResult, setPasswordResult] = useState<PasswordResult | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordCopyStatus, setPasswordCopyStatus] = useState<'idle' | 'success' | 'error'>('idle')

  const [renameCurrentInput, setRenameCurrentInput] = useState('')
  const [renameNewInput, setRenameNewInput] = useState('')
  const currentNames = useMemo(() => parseList(renameCurrentInput), [renameCurrentInput])
  const newNames = useMemo(() => parseList(renameNewInput), [renameNewInput])
  const [isRenamingUsers, setIsRenamingUsers] = useState(false)
  const [renameResult, setRenameResult] = useState<RenameResult | null>(null)
  const [renameError, setRenameError] = useState<string | null>(null)

  const [shutdownResult, setShutdownResult] = useState<ShutdownEvent | null>(null)
  const [shutdownError, setShutdownError] = useState<string | null>(null)
  const [isFetchingShutdown, setIsFetchingShutdown] = useState(false)

  const [rdpMode, setRdpMode] = useState<RdpMode>(2)
  const [rdpIp, setRdpIp] = useState('')
  const [rdpDays, setRdpDays] = useState(7)
  const [rdpHours, setRdpHours] = useState(1)
  const [rdpResult, setRdpResult] = useState<RdpQueryResponse | null>(null)
  const [rdpError, setRdpError] = useState<string | null>(null)
  const [isFetchingRdp, setIsFetchingRdp] = useState(false)

  useEffect(() => {
    setManualPasswords((prev) => {
      const next: Record<string, string> = {}
      usersList.forEach((user) => {
        next[user] = prev[user] ?? ''
      })
      return next
    })
  }, [usersList])

  const updateConnectField = <K extends keyof ConnectBody>(field: K, value: ConnectBody[K]) => {
    setConnectForm((prev) => ({ ...prev, [field]: value }))
  }

  const buildConnectPayload = (): ConnectBody => ({
    ...connectForm,
    host: connectForm.host.trim(),
    username: normalizeString(connectForm.username),
    password: normalizeString(connectForm.password),
  })

  const handleConnect = async () => {
    setConnectError(null)
    setPasswordResult(null)
    setRenameResult(null)
    setShutdownResult(null)
    setShutdownError(null)
    setRdpResult(null)
    setRdpError(null)

    if (!connectForm.host.trim()) {
      setConnectError('Ingrese la IP o nombre del host Windows')
      return
    }

    setIsConnecting(true)
    try {
      const payload = buildConnectPayload()
      const { hostname: remoteHostname } = await apiConnect(payload)
      setConnectedHost(payload.host)
      setHostname(remoteHostname)
      setActivePanel('passwords')
    } catch (error) {
      setConnectedHost(null)
      setHostname(null)
      setConnectError(getErrorMessage(error))
    } finally {
      setIsConnecting(false)
    }
  }

  const passwordSummaryText = useMemo(() => {
    if (!passwordResult || !passwordResult.changed.length) return ''
    return passwordResult.changed.map((item) => `${item.user}: ${item.password}`).join('\n')
  }, [passwordResult])

  const handleChangePasswords = async () => {
    setPasswordError(null)
    setPasswordResult(null)
    setPasswordCopyStatus('idle')

    if (!connectedHost) {
      setPasswordError('Realice primero la conexión con el servidor')
      return
    }

    if (!usersList.length) {
      setPasswordError('Ingrese al menos un usuario')
      return
    }

    if (!autoGenerate) {
      const missing = usersList.filter((user) => !manualPasswords[user]?.trim())
      if (missing.length) {
        setPasswordError(`Falta la contraseña para: ${missing.join(', ')}`)
        return
      }
    }

    setIsChangingPasswords(true)
    try {
      const payload = {
        ...buildConnectPayload(),
        users: usersList,
        auto_generate: autoGenerate,
        passwords: autoGenerate ? undefined : usersList.reduce<Record<string, string>>((acc, user) => {
          acc[user] = manualPasswords[user]
          return acc
        }, {}),
      }
      const result = await apiChangePasswords(payload)
      setPasswordResult(result)
    } catch (error) {
      setPasswordError(getErrorMessage(error))
    } finally {
      setIsChangingPasswords(false)
    }
  }

  const handleDownloadPasswords = () => {
    if (!passwordResult) return
    const lines = [
      `Host: ${hostname ?? connectedHost ?? ''}`,
      `Fecha: ${new Date().toLocaleString()}`,
      '',
      'Usuarios actualizados:',
      ...passwordResult.changed.map((item) => `${item.user}: ${item.password}`),
      '',
      'Registros fallidos:',
      ...(passwordResult.failed.length ? passwordResult.failed : ['Ninguno']),
    ]
    downloadTextFile('cambios-contraseñas.txt', lines)
  }

  const handleCopyPasswords = async () => {
    if (!passwordSummaryText) return
    try {
      await navigator.clipboard.writeText(passwordSummaryText)
      setPasswordCopyStatus('success')
    } catch (error) {
      console.error('Clipboard copy failed', error)
      setPasswordCopyStatus('error')
    }
  }

  const handleRenameUsers = async () => {
    setRenameError(null)
    setRenameResult(null)

    if (!connectedHost) {
      setRenameError('Realice primero la conexión con el servidor')
      return
    }

    if (!currentNames.length) {
      setRenameError('Ingrese al menos un usuario a renombrar')
      return
    }

    if (currentNames.length !== newNames.length) {
      setRenameError('La cantidad de nombres actuales y nuevos debe coincidir')
      return
    }

    setIsRenamingUsers(true)
    try {
      const payload = {
        ...buildConnectPayload(),
        current_names: currentNames,
        new_names: newNames,
      }
      const result = await apiRenameUsers(payload)
      setRenameResult(result)
    } catch (error) {
      setRenameError(getErrorMessage(error))
    } finally {
      setIsRenamingUsers(false)
    }
  }

  const handleDownloadRename = () => {
    if (!renameResult) return
    const lines = [
      `Host: ${hostname ?? connectedHost ?? ''}`,
      `Fecha: ${new Date().toLocaleString()}`,
      '',
      'Renombrados:',
      ...(renameResult.renamed.length ? renameResult.renamed : ['Ninguno']),
      '',
      'Fallidos:',
      ...(renameResult.failed.length ? renameResult.failed : ['Ninguno']),
    ]
    downloadTextFile('cambios-nombres.txt', lines)
  }

  const formattedShutdownTime = useMemo(() => {
    if (!shutdownResult?.time) return null
    try {
      return new Date(shutdownResult.time).toLocaleString()
    } catch {
      return shutdownResult.time
    }
  }, [shutdownResult])

  const handleFetchShutdown = async () => {
    setShutdownError(null)
    setShutdownResult(null)

    if (!connectedHost) {
      setShutdownError('Realice primero la conexión con el servidor')
      return
    }

    setIsFetchingShutdown(true)
    try {
      const payload = buildConnectPayload()
      const { event } = await apiLastShutdown(payload)
      setShutdownResult(event)
    } catch (error) {
      setShutdownError(getErrorMessage(error))
    } finally {
      setIsFetchingShutdown(false)
    }
  }

  const handleFetchRdp = async () => {
    setRdpError(null)
    setRdpResult(null)

    if (!connectedHost) {
      setRdpError('Realice primero la conexión con el servidor')
      return
    }

    if ((rdpMode === 1 || rdpMode === 3) && !rdpIp.trim()) {
      setRdpError('Ingrese una dirección IP para el modo seleccionado')
      return
    }

    setIsFetchingRdp(true)
    try {
      const payload = {
        ...buildConnectPayload(),
        mode: rdpMode,
        ip_address: rdpIp.trim() || undefined,
        days: rdpDays,
        hours: rdpHours,
      }
      const { result } = await apiRdpConnections(payload)
      setRdpResult(result)
    } catch (error) {
      setRdpError(getErrorMessage(error))
    } finally {
      setIsFetchingRdp(false)
    }
  }

  const formattedRdpItems = useMemo(() => {
    if (!rdpResult?.items?.length) return []
    return rdpResult.items.map((item) => ({
      ...item,
      TimeCreatedLocal: item.TimeCreated ? new Date(item.TimeCreated).toLocaleString() : 'N/D',
    }))
  }, [rdpResult])

  return (
    <div className="min-h-screen bg-slate-100/40 pb-16">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-12">
        <header className="text-center">
          <p className="text-sm font-medium uppercase tracking-wide text-brand-700">Administración WinRM</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-900 sm:text-4xl">Panel de usuarios Windows</h1>
          <p className="mt-4 text-base text-slate-600">
            Conéctese a un servidor Windows vía WinRM sobre HTTPS (5986) y ejecute tareas de cambio de contraseñas o
            renombrado de usuarios locales.
          </p>
        </header>

        <section className="card">
          <div className="flex flex-col gap-6 p-6">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Conexión</h2>
              <p className="text-sm text-slate-600">
                Use las credenciales definidas en el backend (por defecto variables de entorno). Puede sobreescribirlas
                ingresándolas aquí.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                Host / IP
                <input
                  className="input"
                  value={connectForm.host}
                  onChange={(event) => updateConnectField('host', event.target.value)}
                  placeholder="Ej: 10.0.0.12"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                Usuario (opcional)
                <input
                  className="input"
                  value={connectForm.username ?? ''}
                  onChange={(event) => updateConnectField('username', event.target.value)}
                  placeholder="Usar credencial por defecto"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                Contraseña (opcional)
                <input
                  className="input"
                  type="password"
                  value={connectForm.password ?? ''}
                  onChange={(event) => updateConnectField('password', event.target.value)}
                  placeholder="Usar credencial por defecto"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                Puerto
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={connectForm.port ?? ''}
                  onChange={(event) => {
                    const value = event.target.value
                    updateConnectField('port', value ? Number(value) : undefined)
                  }}
                />
              </label>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-2 text-sm text-slate-600">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={connectForm.use_https ?? false}
                    onChange={(event) => updateConnectField('use_https', event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  Usar HTTPS (recomendado)
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={connectForm.ignore_cert ?? false}
                    onChange={(event) => updateConnectField('ignore_cert', event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  Ignorar certificado (usar para certificados autofirmados)
                </label>
              </div>

              <button
                type="button"
                className="btn-primary w-full sm:w-auto"
                onClick={handleConnect}
                disabled={isConnecting}
              >
                {isConnecting ? 'Conectando…' : 'Probar conexión'}
              </button>
            </div>

            {connectError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{connectError}</p>}

            {connectedHost && (
              <div className="rounded-xl border border-brand-100 bg-brand-50/70 px-4 py-3 text-sm text-slate-700">
                <p className="font-medium text-brand-700">Conexión lista</p>
                <p>
                  Host: <span className="font-semibold">{connectedHost}</span>
                  {hostname ? ` · Equipo: ${hostname}` : ''}
                </p>
                <p>
                  Puerto {connectForm.port ?? 5986} · HTTPS {connectForm.use_https ? 'activo' : 'desactivado'} · Ignorar
                  certificado {connectForm.ignore_cert ? 'sí' : 'no'}
                </p>
              </div>
            )}
          </div>
        </section>

        {connectedHost && (
          <div className="grid gap-6 lg:grid-cols-[260px,1fr]">
            <aside className="card p-6">
              <h3 className="text-lg font-semibold text-slate-900">Menú principal</h3>
              <p className="mt-1 text-sm text-slate-600">Seleccione la acción a realizar.</p>
              <div className="mt-4 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setActivePanel('passwords')}
                  className={`rounded-lg px-4 py-2 text-left text-sm font-medium transition
                    ${
                      activePanel === 'passwords'
                        ? 'bg-brand-600 text-white shadow'
                        : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'
                    }`}
                >
                  Cambio de contraseñas
                </button>
                <button
                  type="button"
                  onClick={() => setActivePanel('rename')}
                  className={`rounded-lg px-4 py-2 text-left text-sm font-medium transition
                    ${
                      activePanel === 'rename'
                        ? 'bg-brand-600 text-white shadow'
                        : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'
                    }`}
                >
                  Cambio de nombre de usuarios
                </button>
                <button
                  type="button"
                  onClick={() => setActivePanel('rdp')}
                  className={`rounded-lg px-4 py-2 text-left text-sm font-medium transition
                    ${
                      activePanel === 'rdp'
                        ? 'bg-brand-600 text-white shadow'
                        : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'
                    }`}
                >
                  Conexiones RDP
                </button>
                <button
                  type="button"
                  onClick={() => setActivePanel('shutdown')}
                  className={`rounded-lg px-4 py-2 text-left text-sm font-medium transition
                    ${
                      activePanel === 'shutdown'
                        ? 'bg-brand-600 text-white shadow'
                        : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'
                    }`}
                >
                  Último apagado/reinicio
                </button>
              </div>
            </aside>

            <section className="card p-6">
              {activePanel === 'passwords' ? (
                <div className="flex flex-col gap-6">
                  <header>
                    <h3 className="text-xl font-semibold text-slate-900">Cambio de contraseñas</h3>
                    <p className="mt-1 text-sm text-slate-600">
                      Ingrese los usuarios (separados por espacio, coma o salto de línea). Por defecto se generan
                      contraseñas seguras automáticamente.
                    </p>
                  </header>

                  <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                    Usuarios
                    <textarea
                      className="input h-32 resize-y"
                      value={usersInput}
                      onChange={(event) => setUsersInput(event.target.value)}
                      placeholder="Ej: Administrador Operador1"
                    />
                  </label>

                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      checked={autoGenerate}
                      onChange={(event) => setAutoGenerate(event.target.checked)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    Generar contraseñas automáticamente
                  </label>

                  {!autoGenerate && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm text-slate-600">
                        Ingrese la contraseña para cada usuario. Si queda un campo vacío, no se enviará la solicitud.
                      </p>
                      <div className="mt-3 flex max-h-64 flex-col gap-3 overflow-y-auto pr-2">
                        {usersList.length === 0 ? (
                          <p className="text-sm text-slate-500">Agregue usuarios para completar las contraseñas manuales.</p>
                        ) : (
                          usersList.map((user) => (
                            <div key={user} className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[160px,1fr]">
                              <span className="text-sm font-medium text-slate-700">{user}</span>
                              <input
                                className="input"
                                value={manualPasswords[user] ?? ''}
                                onChange={(event) =>
                                  setManualPasswords((prev) => ({ ...prev, [user]: event.target.value }))
                                }
                                placeholder="Contraseña nueva"
                              />
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    {passwordError && (
                      <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{passwordError}</p>
                    )}
                    <div className="flex flex-1 justify-end">
                      <button
                        type="button"
                        onClick={handleChangePasswords}
                        className="btn-primary w-full sm:w-auto"
                        disabled={isChangingPasswords}
                      >
                        {isChangingPasswords ? 'Procesando…' : 'Cambiar contraseñas'}
                      </button>
                    </div>
                  </div>

                  {passwordResult && (
                    <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-4 text-sm text-slate-700">
                      <div className="flex flex-col gap-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-semibold text-brand-700">Resultado</p>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={handleCopyPasswords}
                              className="rounded-lg border border-brand-600 px-3 py-1 text-xs font-medium text-brand-700 hover:bg-brand-600 hover:text-white"
                            >
                              Copiar listado
                            </button>
                            <button
                              type="button"
                              onClick={handleDownloadPasswords}
                              className="rounded-lg border border-brand-600 px-3 py-1 text-xs font-medium text-brand-700 hover:bg-brand-600 hover:text-white"
                            >
                              Descargar resumen
                            </button>
                          </div>
                        </div>

                        <div>
                          <p className="font-medium">Usuarios actualizados</p>
                          {passwordResult.changed.length ? (
                            <div className="space-y-3">
                              <ul className="list-disc pl-5">
                                {passwordResult.changed.map((item) => (
                                  <li key={item.user} className="font-mono text-sm">
                                    {item.user}: {item.password}
                                  </li>
                                ))}
                              </ul>
                              <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-700">{passwordSummaryText}</pre>
                              {passwordCopyStatus === 'success' && (
                                <p className="text-xs font-medium text-emerald-600">Copiado al portapapeles.</p>
                              )}
                              {passwordCopyStatus === 'error' && (
                                <p className="text-xs font-medium text-red-600">No se pudo copiar automáticamente.</p>
                              )}
                            </div>
                          ) : (
                            <p className="text-sm text-slate-600">No hubo cambios.</p>
                          )}
                        </div>

                        <div>
                          <p className="font-medium">Errores</p>
                          {passwordResult.failed.length ? (
                            <ul className="mt-1 list-disc pl-5">
                              {passwordResult.failed.map((item, index) => (
                                <li key={`${item}-${index}`} className="text-sm text-red-600">
                                  {item}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-sm text-slate-600">Ninguno.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : activePanel === 'rename' ? (
                <div className="flex flex-col gap-6">
                  <header>
                    <h3 className="text-xl font-semibold text-slate-900">Cambio de nombre</h3>
                    <p className="mt-1 text-sm text-slate-600">
                      Ingrese la lista de usuarios actuales y los nuevos nombres en el mismo orden. Puede separar valores
                      por espacios, comas o saltos de línea.
                    </p>
                  </header>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                      Usuarios actuales
                      <textarea
                        className="input h-32 resize-y"
                        value={renameCurrentInput}
                        onChange={(event) => setRenameCurrentInput(event.target.value)}
                        placeholder="Ej: Operador1 Operador2"
                      />
                    </label>

                    <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                      Nuevos nombres
                      <textarea
                        className="input h-32 resize-y"
                        value={renameNewInput}
                        onChange={(event) => setRenameNewInput(event.target.value)}
                        placeholder="Ej: Soporte1 Soporte2"
                      />
                    </label>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    {renameError && (
                      <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{renameError}</p>
                    )}
                    <div className="flex flex-1 justify-end">
                      <button
                        type="button"
                        onClick={handleRenameUsers}
                        className="btn-primary w-full sm:w-auto"
                        disabled={isRenamingUsers}
                      >
                        {isRenamingUsers ? 'Procesando…' : 'Renombrar usuarios'}
                      </button>
                    </div>
                  </div>

                  {renameResult && (
                    <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-4 text-sm text-slate-700">
                      <div className="flex flex-col gap-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-semibold text-brand-700">Resultado</p>
                          <button
                            type="button"
                            onClick={handleDownloadRename}
                            className="rounded-lg border border-brand-600 px-3 py-1 text-xs font-medium text-brand-700 hover:bg-brand-600 hover:text-white"
                          >
                            Descargar resumen
                          </button>
                        </div>

                        <div>
                          <p className="font-medium">Renombrados</p>
                          {renameResult.renamed.length ? (
                            <ul className="mt-1 list-disc pl-5">
                              {renameResult.renamed.map((item, index) => (
                                <li key={`${item}-${index}`} className="text-sm">
                                  {item}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-sm text-slate-600">No hubo cambios.</p>
                          )}
                        </div>

                        <div>
                          <p className="font-medium">Errores</p>
                          {renameResult.failed.length ? (
                            <ul className="mt-1 list-disc pl-5">
                              {renameResult.failed.map((item, index) => (
                                <li key={`${item}-${index}`} className="text-sm text-red-600">
                                  {item}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-sm text-slate-600">Ninguno.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : activePanel === 'rdp' ? (
                <div className="flex flex-col gap-6">
                  <header>
                    <h3 className="text-xl font-semibold text-slate-900">Conexiones RDP</h3>
                    <p className="mt-1 text-sm text-slate-600">
                      Ejecuta búsquedas sobre eventos 4624, 1149 y sesiones activas para identificar conexiones RDP recientes.
                    </p>
                  </header>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                      Modo
                      <select
                        className="input"
                        value={rdpMode}
                        onChange={(event) => setRdpMode(Number(event.target.value) as RdpMode)}
                      >
                        <option value={1}>1 – Verificar IP en últimos días</option>
                        <option value={2}>2 – Listar todas las conexiones</option>
                        <option value={3}>3 – Verificar IP en últimas horas</option>
                      </select>
                    </label>

                    <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                      Dirección IP (requerida modos 1 y 3)
                      <input
                        className="input"
                        value={rdpIp}
                        onChange={(event) => setRdpIp(event.target.value)}
                        placeholder="Ej: 192.168.0.10"
                      />
                    </label>

                    <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                      Días de historial (modos 1 y 2)
                      <input
                        className="input"
                        type="number"
                        min={1}
                        value={rdpDays}
                        onChange={(event) => setRdpDays(Number(event.target.value) || 1)}
                        disabled={rdpMode === 3}
                      />
                    </label>

                    <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                      Horas recientes (modo 3)
                      <input
                        className="input"
                        type="number"
                        min={1}
                        value={rdpHours}
                        onChange={(event) => setRdpHours(Number(event.target.value) || 1)}
                        disabled={rdpMode !== 3}
                      />
                    </label>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    <p>
                      El modo 2 ignora el campo IP y lista todas las IP en los últimos días junto con sesiones activas. Los modos 1 y 3 requieren una IP específica.
                    </p>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    {rdpError && (
                      <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{rdpError}</p>
                    )}
                    <div className="flex flex-1 justify-end">
                      <button
                        type="button"
                        onClick={handleFetchRdp}
                        className="btn-primary w-full sm:w-auto"
                        disabled={isFetchingRdp}
                      >
                        {isFetchingRdp ? 'Consultando…' : 'Consultar conexiones'}
                      </button>
                    </div>
                  </div>

                  {rdpResult && (
                    <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-4 text-sm text-slate-700">
                      <div className="flex flex-col gap-3">
                        <div>
                          <p className="font-semibold text-brand-700">Resultado del modo {rdpResult.mode}</p>
                          {rdpResult.message && (
                            <p className="mt-1 text-slate-600">{rdpResult.message}</p>
                          )}
                          {rdpResult.warnings.length > 0 && (
                            <ul className="mt-2 list-disc pl-5 text-xs text-amber-700">
                              {rdpResult.warnings.map((warning, index) => (
                                <li key={`${warning}-${index}`}>{warning}</li>
                              ))}
                            </ul>
                          )}
                        </div>

                        {formattedRdpItems.length > 0 ? (
                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-slate-200 text-left text-xs text-slate-700">
                              <thead className="bg-brand-600/10 text-slate-900">
                                <tr>
                                  <th className="px-3 py-2 font-semibold">Fecha/Hora</th>
                                  <th className="px-3 py-2 font-semibold">IP</th>
                                  <th className="px-3 py-2 font-semibold">Usuario</th>
                                  <th className="px-3 py-2 font-semibold">Origen</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {formattedRdpItems.map((item, index) => (
                                  <tr key={`${item.IpAddress}-${item.TimeCreated}-${index}`}>
                                    <td className="px-3 py-2 whitespace-nowrap">{item.TimeCreatedLocal}</td>
                                    <td className="px-3 py-2 whitespace-nowrap font-mono">{item.IpAddress || 'N/D'}</td>
                                    <td className="px-3 py-2">{item.UserName || 'N/D'}</td>
                                    <td className="px-3 py-2">{item.SourceLog || 'N/D'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p className="text-sm text-slate-600">No se encontraron registros.</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-6">
                  <header>
                    <h3 className="text-xl font-semibold text-slate-900">Último apagado o reinicio</h3>
                    <p className="mt-1 text-sm text-slate-600">
                      Consulta el evento 1074 del registro de Windows para identificar quién inició el último apagado o reinicio.
                    </p>
                  </header>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    <p>
                      Se utiliza `Get-WinEvent` sobre el registro <span className="font-mono">System</span>. Es necesario tener permisos para leer los eventos remotos.
                    </p>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    {shutdownError && (
                      <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{shutdownError}</p>
                    )}
                    <div className="flex flex-1 justify-end">
                      <button
                        type="button"
                        onClick={handleFetchShutdown}
                        className="btn-primary w-full sm:w-auto"
                        disabled={isFetchingShutdown}
                      >
                        {isFetchingShutdown ? 'Consultando…' : 'Obtener evento'}
                      </button>
                    </div>
                  </div>

                  {shutdownResult && (
                    <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-4 text-sm text-slate-700">
                      <p className="font-semibold text-brand-700">Resultado ({shutdownResult.status === 'found' ? 'evento encontrado' : 'sin registros'})</p>
                      {shutdownResult.status === 'found' ? (
                        <div className="mt-3 space-y-2">
                          {formattedShutdownTime && (
                            <p><span className="font-medium">Fecha y hora:</span> {formattedShutdownTime}</p>
                          )}
                          {shutdownResult.user && (
                            <p><span className="font-medium">Usuario/Proceso:</span> {shutdownResult.user}</p>
                          )}
                          <div>
                            <p className="font-medium">Mensaje del evento</p>
                            <pre className="mt-1 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">{shutdownResult.message || 'Sin detalles'}</pre>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-2 text-slate-600">
                          No se encontró un evento de apagado/reinicio (ID 1074). Es posible que el registro haya sido borrado o que el apagado haya sido inesperado.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
