import { WSContext, defineWebSocketHelper } from '../../helper/websocket'
import type { UpgradeWebSocket, WSEvents, WSReadyState } from '../../helper/websocket'

// Based on https://github.com/honojs/hono/issues/1153#issuecomment-1767321332
export const upgradeWebSocket: UpgradeWebSocket<
  WebSocket,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  Omit<WSEvents<WebSocket>, 'onOpen'>
> = defineWebSocketHelper(async (c, events) => {
  const upgradeHeader = c.req.header('Upgrade')
  if (upgradeHeader !== 'websocket') {
    return
  }

  // @ts-expect-error WebSocketPair is not typed
  const webSocketPair = new WebSocketPair()
  const client: WebSocket = webSocketPair[0]
  const server: WebSocket = webSocketPair[1]

  const wsContext = new WSContext<WebSocket>({
    close: (code, reason) => server.close(code, reason),
    get protocol() {
      return server.protocol
    },
    raw: server,
    get readyState() {
      return server.readyState as WSReadyState
    },
    url: server.url ? new URL(server.url) : null,
    send: (source) => server.send(source),
  })

  let waitUntil: ((p: Promise<unknown>) => void) | undefined
  try {
    const ctx = c.executionCtx
    if (typeof ctx?.waitUntil === 'function') {
      waitUntil = (p: Promise<unknown>) => ctx.waitUntil(p)
    }
  } catch {
    // executionCtx may not be available
  }

  const wrapHandler = <E extends Event>(fn: ((evt: E, ws: typeof wsContext) => void) | undefined) => {
    if (!fn) {
      return undefined
    }
    return (evt: E) => {
      const result = fn(evt, wsContext)
      if (waitUntil && result instanceof Promise) {
        waitUntil(result)
      }
    }
  }

  // note: cloudflare workers doesn't support 'open' event

  const onClose = wrapHandler(events.onClose)
  if (onClose) {
    server.addEventListener('close', onClose as EventListener)
  }
  const onMessage = wrapHandler(events.onMessage)
  if (onMessage) {
    server.addEventListener('message', onMessage as EventListener)
  }
  const onError = wrapHandler(events.onError)
  if (onError) {
    server.addEventListener('error', onError as EventListener)
  }

  // @ts-expect-error - server.accept is not typed
  server.accept?.()
  return new Response(null, {
    status: 101,
    // @ts-expect-error - webSocket is not typed
    webSocket: client,
  })
})
