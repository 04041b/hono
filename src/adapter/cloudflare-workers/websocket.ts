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

  // note: cloudflare workers doesn't support 'open' event

  let executionCtx: { waitUntil(promise: Promise<unknown>): void } | undefined
  try {
    executionCtx = c.executionCtx
  } catch {
    // executionCtx is not available in all environments (e.g. testing without ExecutionContext)
  }

  const waitUntilIfNeeded = (result: unknown) => {
    if (result instanceof Promise && executionCtx) {
      executionCtx.waitUntil(result)
    }
  }

  if (events.onClose) {
    server.addEventListener('close', (evt: CloseEvent) =>
      waitUntilIfNeeded(events.onClose?.(evt, wsContext))
    )
  }
  if (events.onMessage) {
    server.addEventListener('message', (evt: MessageEvent) =>
      waitUntilIfNeeded(events.onMessage?.(evt, wsContext))
    )
  }
  if (events.onError) {
    server.addEventListener('error', (evt: Event) =>
      waitUntilIfNeeded(events.onError?.(evt, wsContext))
    )
  }

  // @ts-expect-error - server.accept is not typed
  server.accept?.()
  return new Response(null, {
    status: 101,
    // @ts-expect-error - webSocket is not typed
    webSocket: client,
  })
})
