import { useEffect, useMemo, useState, useRef } from 'react'
import { isAxiosError } from 'axios'
import toast, { Toaster } from 'react-hot-toast'
import type { ConnectBody } from './api'
import {
  apiChangePasswords,
  apiConnect,
  apiCountLocalUsers,
  apiLastShutdown,
  apiRdpConnections,
  apiRenameUsers,
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

const SunIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
  </svg>
)

const MoonIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
  </svg>
)

const ServerIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
    <path strokeLinecap="round" strokeLinejoin="round" d="m5.25 4.5 7.5 7.5-7.5 7.5m4.5 0h4m-9 0h9" />
    <rect x="2" y="2" width="20" height="8" rx="2" />
    <rect x="2" y="14" width="20" height="8" rx="2" />
  </svg>
)

const ShieldCheckIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.072 1.25A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.25-3.072A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.072-1.25A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.25 3.072 3.745 3.745 0 0 1-1.25 3.072c-.678.458-1.8 1.068-3.068 1.593Z" />
  </svg>
)

const KeyIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 9Z" />
  </svg>
)

const GlobeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
  </svg>
)

const LinkIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
  </svg>
)

const MonitorIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0V12a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 12V5.25" />
  </svg>
)

const App = () => {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme')
    return (saved as 'light' | 'dark') || 'light'
  })

  const mainContentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    localStorage.setItem('theme', theme)
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [theme])

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light')
  }

  const [connectForm, setConnectForm] = useState<ConnectBody>({
    host: '',
    use_https: true,
    port: 5986,
    ignore_cert: true,
  })
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectedHost, setConnectedHost] = useState<string | null>(null)
  const [hostname, setHostname] = useState<string | null>(null)

  const [activePanel, setActivePanel] = useState<'passwords' | 'rename' | 'shutdown' | 'rdp' | 'userCount'>('passwords')

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

  const [userCount, setUserCount] = useState<number | null>(null)
  const [userCountError, setUserCountError] = useState<string | null>(null)
  const [isFetchingUserCount, setIsFetchingUserCount] = useState(false)
  const excludedAccounts = useMemo(
    () => ['WDAGUtilityAccount', 'administrator', 'wavenet', 'DefaultAccount', 'Guest'],
    []
  )

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
    username: 'wavenet',
    password: normalizeString(connectForm.password),
  })

  const handleConnect = async () => {
    setPasswordResult(null)
    setRenameResult(null)
    setUserCount(null)
    setShutdownResult(null)
    setRdpResult(null)

    if (!connectForm.host.trim()) {
      toast.error('Ingrese la IP o nombre del host Windows')
      return
    }

    setIsConnecting(true)
    try {
      const payload = buildConnectPayload()
      const { hostname: remoteHostname } = await apiConnect(payload)
      setConnectedHost(payload.host)
      setHostname(remoteHostname)
      setActivePanel('passwords')
      toast.success(`Conectado a ${remoteHostname}`)
      
      setTimeout(() => {
        mainContentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 300)
    } catch (error) {
      setConnectedHost(null)
      setHostname(null)
      toast.error(getErrorMessage(error))
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
      if (result.changed.length > 0) {
        toast.success(`${result.changed.length} contraseña(s) actualizada(s)`)
      }
      if (result.failed.length > 0) {
        toast.error(`${result.failed.length} usuario(s) no se pudieron modificar`)
      }
    } catch (error) {
      toast.error(getErrorMessage(error))
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
    toast.success('Archivo descargado')
  }

  const handleCopyPasswords = async () => {
    if (!passwordSummaryText) return
    try {
      await navigator.clipboard.writeText(passwordSummaryText)
      setPasswordCopyStatus('success')
      toast.success('Copiado al portapapeles')
    } catch (error) {
      console.error('Clipboard copy failed', error)
      setPasswordCopyStatus('error')
      toast.error('No se pudo copiar automáticamente')
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
      if (result.renamed.length > 0) {
        toast.success(`${result.renamed.length} usuario(s) renombrado(s)`)
      }
      if (result.failed.length > 0) {
        toast.error(`${result.failed.length} usuario(s) no se pudieron renombrar`)
      }
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setIsRenamingUsers(false)
    }
  }

  const handleFetchUserCount = async () => {
    setUserCountError(null)
    setUserCount(null)

    if (!connectedHost) {
      setUserCountError('Realice primero la conexión con el servidor')
      return
    }

    setIsFetchingUserCount(true)
    try {
      const payload = buildConnectPayload()
      const { count } = await apiCountLocalUsers(payload)
      setUserCount(count)
      toast.success(`Se encontraron ${count} usuario(s) local(es)`)
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setIsFetchingUserCount(false)
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
    toast.success('Archivo descargado')
  }

  const handleNewConnection = () => {
    window.location.reload()
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
      if (event.status === 'found') {
        toast.success('Evento de apagado encontrado')
      } else {
        toast('No se encontró evento de apagado', { icon: 'ℹ️' })
      }
    } catch (error) {
      toast.error(getErrorMessage(error))
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
      if (result.items.length > 0) {
        toast.success(`${result.items.length} conexión(es) encontrada(s)`)
      } else {
        toast('No se encontraron conexiones', { icon: 'ℹ️' })
      }
    } catch (error) {
      toast.error(getErrorMessage(error))
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
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: 'var(--toast-bg)',
            color: 'var(--toast-text)',
            border: '1px solid var(--toast-border)',
            borderRadius: '12px',
            padding: '12px 16px',
            fontSize: '14px',
            boxShadow: 'var(--shadow-card-hover)',
          },
          success: {
            iconTheme: { primary: '#10b981', secondary: 'white' },
          },
          error: {
            iconTheme: { primary: '#ef4444', secondary: 'white' },
          },
        }}
      />
      <div className="min-h-screen pb-16 dark:bg-slate-900">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-12">
          <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-8 py-10 text-center shadow-2xl dark:from-slate-800 dark:via-slate-900 dark:to-slate-950">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20viewBox%3D%220%200%2060%2060%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cg%20fill%3D%22none%22%20fill-rule%3D%22evenodd%22%3E%3Cg%20fill%3D%22%23ffffff%22%20fill-opacity%3D%220.03%22%3E%3Cpath%20d%3D%22M36%2034v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6%2034v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6%204V0H4v4H0v2h4v4h2V6h4V4H6z%22%2F%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fsvg%3E')] opacity-40"></div>
            <div className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-brand-500/10 blur-3xl"></div>
            <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl"></div>
            
            <div className="relative z-10 flex items-center justify-between">
              <div className="hidden sm:block"></div>
              <button
                type="button"
                onClick={toggleTheme}
                className="rounded-full bg-white/10 p-3 text-white/80 backdrop-blur transition-all hover:bg-white/20 hover:scale-110"
                aria-label="Cambiar tema"
              >
                {theme === 'light' ? <MoonIcon /> : <SunIcon />}
              </button>
            </div>

            <div className="relative z-10 mt-6 flex flex-col items-center">
              <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 shadow-xl shadow-brand-500/30">
                <ServerIcon />
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
                ADMINISTRACIÓN <span className="text-brand-400">WINRM</span>
              </h1>
              <p className="mt-4 max-w-xl text-base text-slate-300">
                Conéctese de forma segura a servidores Windows mediante WinRM sobre HTTPS. Administre usuarios, monitoree conexiones y gestione el sistema remotamente.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-sm text-slate-400">
                <div className="flex items-center gap-2">
                  <ShieldCheckIcon />
                  <span>Conexión segura</span>
                </div>
                <div className="flex items-center gap-2">
                  <KeyIcon />
                  <span>Gestión de usuarios</span>
                </div>
                <div className="flex items-center gap-2">
                  <GlobeIcon />
                  <span>Monitoreo RDP</span>
                </div>
              </div>
            </div>
          </header>

          <section className="card relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-brand-50/50 to-transparent dark:from-brand-900/10 pointer-events-none"></div>
            <div className="relative flex flex-col gap-8 p-8">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-100 dark:bg-brand-900/30">
                  <LinkIcon />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">Nueva conexión</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Ingrese los datos del servidor Windows</p>
                </div>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <label className="group relative flex flex-col gap-2.5">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-md bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 text-xs">IP</span>
                    Host / Dirección IP
                  </span>
                  <div className="relative">
                    <input
                      className="input pr-12"
                      value={connectForm.host}
                      onChange={(event) => updateConnectField('host', event.target.value)}
                      placeholder="192.168.1.100"
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-brand-500">
                      <MonitorIcon />
                    </div>
                  </div>
                </label>

                <label className="group relative flex flex-col gap-2.5">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-md bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 text-xs">🔑</span>
                    Contraseña
                  </span>
                  <div className="relative">
                    <input
                      className="input pr-12"
                      type="password"
                      value={connectForm.password ?? ''}
                      onChange={(event) => updateConnectField('password', event.target.value)}
                      placeholder="••••••••••••"
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-brand-500">
                      <KeyIcon />
                    </div>
                  </div>
                </label>

                <label className="flex flex-col gap-2.5">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-md bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 text-xs">#</span>
                    Puerto
                  </span>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    value={connectForm.port ?? ''}
                    onChange={(event) => {
                      const value = event.target.value
                      updateConnectField('port', value ? Number(value) : undefined)
                    }}
                    placeholder="5986"
                  />
                </label>
              </div>

              <div className="flex flex-col gap-4 rounded-xl bg-slate-50/50 p-5 dark:bg-slate-800/30">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                  <ShieldCheckIcon />
                  Opciones de conexión
                </div>
                <div className="flex flex-wrap gap-6">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <div className="relative flex items-center">
                      <input
                        type="checkbox"
                        checked={connectForm.use_https ?? false}
                        onChange={(event) => updateConnectField('use_https', event.target.checked)}
                        className="peer h-5 w-5 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-slate-600"
                      />
                      <div className="pointer-events-none absolute left-2 top-2 h-2.5 w-2.5 rounded bg-white opacity-0 peer-checked:opacity-100">
                        <svg viewBox="0 0 14 14" fill="none" className="h-full w-full stroke-2 text-brand-600">
                          <path d="M3 8L6 11L11 3.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                    </div>
                    <span className="text-sm text-slate-600 dark:text-slate-400">Usar HTTPS <span className="text-brand-600 dark:text-brand-400 font-medium">(recomendado)</span></span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <div className="relative flex items-center">
                      <input
                        type="checkbox"
                        checked={connectForm.ignore_cert ?? false}
                        onChange={(event) => updateConnectField('ignore_cert', event.target.checked)}
                        className="peer h-5 w-5 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-slate-600"
                      />
                      <div className="pointer-events-none absolute left-2 top-2 h-2.5 w-2.5 rounded bg-white opacity-0 peer-checked:opacity-100">
                        <svg viewBox="0 0 14 14" fill="none" className="h-full w-full stroke-2 text-brand-600">
                          <path d="M3 8L6 11L11 3.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                    </div>
                    <span className="text-sm text-slate-600 dark:text-slate-400">Ignorar certificado <span className="text-slate-400">(autofirmado)</span></span>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4">
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  Usuario: <span className="font-mono font-semibold text-brand-600 dark:text-brand-400">wavenet</span>
                </div>
                <button
                  type="button"
                  className="btn-primary min-w-[180px]"
                  onClick={connectedHost ? handleNewConnection : handleConnect}
                  disabled={!connectedHost && isConnecting}
                >
                  {connectedHost ? (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                      </svg>
                      Nueva conexión
                    </>
                  ) : isConnecting ? (
                    <>
                      <svg className="mr-2 h-5 w-5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Conectando...
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 1 1 9 0v3.75M.75 15.75c0-3.69 3-6.75 6.75-6.75s6.75 3.06 6.75 6.75" />
                      </svg>
                      Conectar
                    </>
                  )}
                </button>
              </div>

              {connectedHost && (
                <div className="flex items-center gap-4 rounded-2xl border border-emerald-200/60 bg-emerald-50/50 p-5 dark:border-emerald-800/40 dark:bg-emerald-900/20">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-6 w-6 text-emerald-600 dark:text-emerald-400">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      <p className="font-bold text-emerald-800 dark:text-emerald-300">Conectado exitosamente</p>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600 dark:text-slate-400">
                      <span><span className="font-medium text-slate-900 dark:text-slate-200">{connectedHost}</span>{hostname && ` (${hostname})`}</span>
                      <span className="hidden sm:inline">•</span>
                      <span>Puerto: {connectForm.port ?? 5986}</span>
                      <span className="hidden sm:inline">•</span>
                      <span>{connectForm.use_https ? '🔒 HTTPS' : '🔓 HTTP'}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          <div ref={mainContentRef}>
            {connectedHost && (
              <div className="grid gap-6 lg:grid-cols-[280px,1fr]">
                <aside className="card p-6">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Menú principal</h3>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Seleccione la acción a realizar.</p>
                  <div className="mt-5 flex flex-col gap-2.5">
                    {[
                      { key: 'passwords', label: 'Cambio de contraseñas', icon: '🔑' },
                      { key: 'rename', label: 'Cambio de nombre', icon: '✏️' },
                      { key: 'userCount', label: 'Usuarios locales', icon: '👥' },
                      { key: 'rdp', label: 'Conexiones RDP', icon: '🖥️' },
                      { key: 'shutdown', label: 'Último apagado', icon: '⏻' },
                    ].map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => setActivePanel(item.key as typeof activePanel)}
                        className={`group flex items-center gap-3 rounded-full px-4 py-2.5 text-left text-sm font-medium transition-all duration-200
                          ${
                            activePanel === item.key
                              ? 'bg-gradient-to-r from-brand-600 to-brand-700 text-white shadow-lg shadow-brand-500/30 dark:from-brand-500 dark:to-brand-600 dark:shadow-brand-500/20'
                              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                      >
                        <span className="text-base">{item.icon}</span>
                        {item.label}
                      </button>
                    ))}
                  </div>
                </aside>

                <section className="card p-6 sm:p-8">
                  {activePanel === 'passwords' ? (
                    <div className="flex flex-col gap-6">
                      <header>
                        <h3 className="text-xl font-semibold text-slate-900 dark:text-white">Cambio de contraseñas</h3>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                          Ingrese los usuarios (separados por espacio, coma o salto de línea). Por defecto se generan contraseñas seguras automáticamente.
                        </p>
                      </header>

                      <label className="flex flex-col gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                        Usuarios
                        <textarea
                          className="input h-32 resize-y"
                          value={usersInput}
                          onChange={(event) => setUsersInput(event.target.value)}
                          placeholder="Ej: Administrador Operador1"
                        />
                      </label>

                      <label className="flex items-center gap-2.5 text-sm text-slate-600 dark:text-slate-400 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={autoGenerate}
                          onChange={(event) => setAutoGenerate(event.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-slate-600"
                        />
                        Generar contraseñas automáticamente
                      </label>

                      {!autoGenerate && (
                        <div className="rounded-xl border border-slate-200 bg-slate-50/50 dark:border-slate-700 dark:bg-slate-800/30 p-4">
                          <p className="text-sm text-slate-600 dark:text-slate-400">
                            Ingrese la contraseña para cada usuario. Si deja un campo vacío, no se procesará.
                          </p>
                          <div className="mt-3 flex max-h-64 flex-col gap-3 overflow-y-auto pr-2">
                            {usersList.length === 0 ? (
                              <p className="text-sm text-slate-500 dark:text-slate-500">Agregue usuarios para completar las contraseñas.</p>
                            ) : (
                              usersList.map((user) => (
                                <div key={user} className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[160px,1fr]">
                                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{user}</span>
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
                          <p className="rounded-lg bg-red-50/80 dark:bg-red-900/30 px-4 py-2.5 text-sm text-red-600 dark:text-red-400">{passwordError}</p>
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
                        <div className="rounded-2xl border border-brand-200/60 bg-brand-50/30 dark:border-brand-800/30 dark:bg-brand-900/15 p-5 text-sm">
                          <div className="flex flex-col gap-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="font-semibold text-brand-700 dark:text-brand-300">Resultado</p>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={handleCopyPasswords}
                                  className="btn-secondary text-xs px-3 py-1.5"
                                >
                                  Copiar
                                </button>
                                <button
                                  type="button"
                                  onClick={handleDownloadPasswords}
                                  className="btn-secondary text-xs px-3 py-1.5"
                                >
                                  Descargar
                                </button>
                              </div>
                            </div>

                            <div>
                              <p className="font-medium text-slate-700 dark:text-slate-300">Usuarios actualizados</p>
                              {passwordResult.changed.length ? (
                                <div className="mt-2 space-y-2">
                                  <ul className="list-disc pl-5 space-y-1">
                                    {passwordResult.changed.map((item) => (
                                      <li key={item.user} className="font-mono text-sm text-slate-800 dark:text-slate-200">
                                        {item.user}: <span className="text-brand-600 dark:text-brand-400">{item.password}</span>
                                      </li>
                                    ))}
                                  </ul>
                                  <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-xl border border-slate-200/60 bg-white/60 dark:border-slate-700/50 dark:bg-slate-800/50 px-3 py-2 font-mono text-xs text-slate-700 dark:text-slate-300">{passwordSummaryText}</pre>
                                  {passwordCopyStatus === 'success' && (
                                    <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">✓ Copiado al portapapeles</p>
                                  )}
                                  {passwordCopyStatus === 'error' && (
                                    <p className="text-xs font-medium text-red-600 dark:text-red-400">✗ No se pudo copiar automáticamente</p>
                                  )}
                                </div>
                              ) : (
                                <p className="mt-1 text-sm text-slate-500 dark:text-slate-500">No hubo cambios.</p>
                              )}
                            </div>

                            <div>
                              <p className="font-medium text-slate-700 dark:text-slate-300">Errores</p>
                              {passwordResult.failed.length ? (
                                <ul className="mt-1 list-disc pl-5">
                                  {passwordResult.failed.map((item, index) => (
                                    <li key={`${item}-${index}`} className="text-sm text-red-600 dark:text-red-400">
                                      {item}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="mt-1 text-sm text-slate-500 dark:text-slate-500">Ninguno.</p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : activePanel === 'rename' ? (
                    <div className="flex flex-col gap-6">
                      <header>
                        <h3 className="text-xl font-semibold text-slate-900 dark:text-white">Cambio de nombre</h3>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                          Ingrese la lista de usuarios actuales y los nuevos nombres en el mismo orden.
                        </p>
                      </header>

                      <div className="grid gap-4 lg:grid-cols-2">
                        <label className="flex flex-col gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                          Usuarios actuales
                          <textarea
                            className="input h-32 resize-y"
                            value={renameCurrentInput}
                            onChange={(event) => setRenameCurrentInput(event.target.value)}
                            placeholder="Ej: Operador1 Operador2"
                          />
                        </label>

                        <label className="flex flex-col gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
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
                          <p className="rounded-lg bg-red-50/80 dark:bg-red-900/30 px-4 py-2.5 text-sm text-red-600 dark:text-red-400">{renameError}</p>
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
                        <div className="rounded-2xl border border-brand-200/60 bg-brand-50/30 dark:border-brand-800/30 dark:bg-brand-900/15 p-5 text-sm">
                          <div className="flex flex-col gap-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="font-semibold text-brand-700 dark:text-brand-300">Resultado</p>
                              <button
                                type="button"
                                onClick={handleDownloadRename}
                                className="btn-secondary text-xs px-3 py-1.5"
                              >
                                Descargar
                              </button>
                            </div>

                            <div>
                              <p className="font-medium text-slate-700 dark:text-slate-300">Renombrados</p>
                              {renameResult.renamed.length ? (
                                <ul className="mt-1 list-disc pl-5">
                                  {renameResult.renamed.map((item, index) => (
                                    <li key={`${item}-${index}`} className="text-sm text-slate-800 dark:text-slate-200">
                                      {item}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="mt-1 text-sm text-slate-500 dark:text-slate-500">No hubo cambios.</p>
                              )}
                            </div>

                            <div>
                              <p className="font-medium text-slate-700 dark:text-slate-300">Errores</p>
                              {renameResult.failed.length ? (
                                <ul className="mt-1 list-disc pl-5">
                                  {renameResult.failed.map((item, index) => (
                                    <li key={`${item}-${index}`} className="text-sm text-red-600 dark:text-red-400">
                                      {item}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="mt-1 text-sm text-slate-500 dark:text-slate-500">Ninguno.</p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : activePanel === 'userCount' ? (
                    <div className="flex flex-col gap-6">
                      <header>
                        <h3 className="text-xl font-semibold text-slate-900 dark:text-white">Cantidad de usuarios locales</h3>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                          Cuenta los usuarios locales habilitados, excluyendo cuentas de sistema y prefijos de SQL.
                        </p>
                      </header>

                      <div className="rounded-xl border border-slate-200 bg-slate-50/50 dark:border-slate-700 dark:bg-slate-800/30 p-4 text-sm">
                        <p className="font-medium text-slate-700 dark:text-slate-300">Se excluyen automáticamente:</p>
                        <ul className="mt-2 list-disc pl-5 space-y-1">
                          {excludedAccounts.map((account) => (
                            <li key={account} className="font-mono text-xs text-slate-600 dark:text-slate-400">
                              {account}
                            </li>
                          ))}
                          <li className="font-mono text-xs text-slate-600 dark:text-slate-400">MSSQLSERVER*</li>
                          <li className="font-mono text-xs text-slate-600 dark:text-slate-400">SQLEXPRESS*</li>
                          <li className="font-mono text-xs text-slate-600 dark:text-slate-400">BEJERMAN*</li>
                        </ul>
                      </div>

                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        {userCountError && (
                          <p className="rounded-lg bg-red-50/80 dark:bg-red-900/30 px-4 py-2.5 text-sm text-red-600 dark:text-red-400">{userCountError}</p>
                        )}
                        <div className="flex flex-1 justify-end">
                          <button
                            type="button"
                            onClick={handleFetchUserCount}
                            className="btn-primary w-full sm:w-auto"
                            disabled={isFetchingUserCount}
                          >
                            {isFetchingUserCount ? 'Consultando…' : 'Contar usuarios'}
                          </button>
                        </div>
                      </div>

                      {userCount !== null && (
                        <div className="rounded-2xl border border-brand-200/60 bg-brand-50/30 dark:border-brand-800/30 dark:bg-brand-900/15 p-6 text-center">
                          <p className="text-4xl font-bold text-brand-600 dark:text-brand-400">{userCount}</p>
                          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">usuarios locales habilitados</p>
                        </div>
                      )}
                    </div>
                  ) : activePanel === 'rdp' ? (
                    <div className="flex flex-col gap-6">
                      <header>
                        <h3 className="text-xl font-semibold text-slate-900 dark:text-white">Conexiones RDP</h3>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                          Busca eventos de conexión RDP en el sistema.
                        </p>
                      </header>

                      <div className="grid gap-4 lg:grid-cols-2">
                        <label className="flex flex-col gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
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

                        <label className="flex flex-col gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                          Dirección IP (modos 1 y 3)
                          <input
                            className="input"
                            value={rdpIp}
                            onChange={(event) => setRdpIp(event.target.value)}
                            placeholder="Ej: 192.168.0.10"
                          />
                        </label>

                        <label className="flex flex-col gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
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

                        <label className="flex flex-col gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
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

                      <div className="rounded-xl border border-slate-200 bg-slate-50/50 dark:border-slate-700 dark:bg-slate-800/30 p-4 text-sm text-slate-600 dark:text-slate-400">
                        <p>El modo 2 lista todas las IPs. Los modos 1 y 3 requieren una IP específica.</p>
                      </div>

                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        {rdpError && (
                          <p className="rounded-lg bg-red-50/80 dark:bg-red-900/30 px-4 py-2.5 text-sm text-red-600 dark:text-red-400">{rdpError}</p>
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
                        <div className="rounded-2xl border border-brand-200/60 bg-brand-50/30 dark:border-brand-800/30 dark:bg-brand-900/15 p-5 text-sm">
                          <div className="flex flex-col gap-4">
                            <div>
                              <p className="font-semibold text-brand-700 dark:text-brand-300">Resultado del modo {rdpResult.mode}</p>
                              {rdpResult.message && (
                                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{rdpResult.message}</p>
                              )}
                              {rdpResult.warnings.length > 0 && (
                                <ul className="mt-2 list-disc pl-5 text-xs text-amber-600 dark:text-amber-400">
                                  {rdpResult.warnings.map((warning, index) => (
                                    <li key={`${warning}-${index}`}>{warning}</li>
                                  ))}
                                </ul>
                              )}
                            </div>

                            {formattedRdpItems.length > 0 ? (
                              <div className="overflow-x-auto rounded-xl border border-slate-200/60 dark:border-slate-700/50">
                                <table className="min-w-full text-left text-xs">
                                  <thead className="bg-gradient-to-r from-brand-100 to-brand-50 dark:from-brand-900/40 dark:to-brand-800/30 text-slate-900 dark:text-slate-200">
                                    <tr>
                                      <th className="px-4 py-3 font-semibold">Fecha/Hora</th>
                                      <th className="px-4 py-3 font-semibold">IP</th>
                                      <th className="px-4 py-3 font-semibold">Usuario</th>
                                      <th className="px-4 py-3 font-semibold">Origen</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100/60 dark:divide-slate-700/40">
                                    {formattedRdpItems.map((item, index) => (
                                      <tr key={`${item.IpAddress}-${item.TimeCreated}-${index}`} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                                        <td className="px-4 py-3 whitespace-nowrap text-slate-700 dark:text-slate-300">{item.TimeCreatedLocal}</td>
                                        <td className="px-4 py-3 whitespace-nowrap font-mono text-slate-800 dark:text-slate-200">{item.IpAddress || 'N/D'}</td>
                                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{item.UserName || 'N/D'}</td>
                                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{item.SourceLog || 'N/D'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <p className="text-sm text-slate-500 dark:text-slate-500">No se encontraron registros.</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-6">
                      <header>
                        <h3 className="text-xl font-semibold text-slate-900 dark:text-white">Último apagado o reinicio</h3>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                          Consulta el evento 1074 del registro de Windows para identificar el último apagado.
                        </p>
                      </header>

                      <div className="rounded-xl border border-slate-200 bg-slate-50/50 dark:border-slate-700 dark:bg-slate-800/30 p-4 text-sm text-slate-600 dark:text-slate-400">
                        <p>Se utiliza <code className="text-brand-600 dark:text-brand-400">Get-WinEvent</code> sobre el registro System.</p>
                      </div>

                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        {shutdownError && (
                          <p className="rounded-lg bg-red-50/80 dark:bg-red-900/30 px-4 py-2.5 text-sm text-red-600 dark:text-red-400">{shutdownError}</p>
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
                        <div className="rounded-2xl border border-brand-200/60 bg-brand-50/30 dark:border-brand-800/30 dark:bg-brand-900/15 p-5 text-sm">
                          <p className="font-semibold text-brand-700 dark:text-brand-300">
                            {shutdownResult.status === 'found' ? '✓ Evento encontrado' : 'Sin registros'}
                          </p>
                          {shutdownResult.status === 'found' ? (
                            <div className="mt-4 space-y-3">
                              {formattedShutdownTime && (
                                <div className="flex items-center gap-2">
                                  <span className="text-slate-500 dark:text-slate-400">📅</span>
                                  <span className="text-slate-700 dark:text-slate-300">{formattedShutdownTime}</span>
                                </div>
                              )}
                              {shutdownResult.user && (
                                <div className="flex items-center gap-2">
                                  <span className="text-slate-500 dark:text-slate-400">👤</span>
                                  <span className="text-slate-700 dark:text-slate-300">{shutdownResult.user}</span>
                                </div>
                              )}
                              <div>
                                <p className="text-slate-500 dark:text-slate-400 mb-1">Mensaje del evento</p>
                                <pre className="mt-1 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-xl border border-slate-200/60 bg-white/60 dark:border-slate-700/50 dark:bg-slate-800/50 px-3 py-2 text-xs text-slate-700 dark:text-slate-300">{shutdownResult.message || 'Sin detalles'}</pre>
                              </div>
                            </div>
                          ) : (
                            <p className="mt-3 text-sm text-slate-500 dark:text-slate-500">
                              No se encontró un evento de apagado/reinicio (ID 1074).
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
      </div>
    </>
  )
}

export default App