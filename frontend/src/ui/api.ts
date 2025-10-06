import axios from 'axios'

// Use same-origin API via Nginx reverse-proxy mounted at /api
const API_BASE = '/api'

export const http = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
})

export type ConnectBody = {
  host: string
  // username/password omitted since backend uses fixed env creds
  username?: string
  password?: string
  use_https?: boolean
  port?: number
  ignore_cert?: boolean
}

export async function apiConnect(body: ConnectBody): Promise<{ hostname: string }> {
  const { data } = await http.post(`/connect/test`, body)
  return data
}

export async function apiChangePasswords(body: ConnectBody & { users: string[]; auto_generate: boolean; passwords?: Record<string, string> }): Promise<{ changed: { user: string, password: string }[], failed: string[] }> {
  const { data } = await http.post(`/users/change-passwords`, body)
  return data
}

export async function apiRenameUsers(body: ConnectBody & { current_names: string[]; new_names: string[] }): Promise<{ renamed: string[], failed: string[] }> {
  const { data } = await http.post(`/users/rename`, body)
  return data
}

export async function apiHealth(): Promise<{ status: string }> {
  const { data } = await http.get(`/health`)
  return data
}

export type ShutdownEvent = {
  status: string
  time?: string | null
  user?: string | null
  message?: string | null
}

export async function apiLastShutdown(body: ConnectBody): Promise<{ event: ShutdownEvent }> {
  const { data } = await http.post(`/system/last-shutdown`, body)
  return data
}

export type RdpMode = 1 | 2 | 3

export type RdpConnection = {
  IpAddress: string
  TimeCreated: string | null
  UserName: string | null
  SourceLog: string | null
}

export type RdpQueryResponse = {
  status: string
  mode: RdpMode
  message?: string
  warnings: string[]
  items: RdpConnection[]
}

export async function apiRdpConnections(body: ConnectBody & { mode: RdpMode; ip_address?: string; days?: number; hours?: number }): Promise<{ result: RdpQueryResponse }> {
  const { data } = await http.post(`/system/rdp-connections`, body)
  return data
}
