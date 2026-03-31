import { Hono } from '../..'
import { Context } from '../../context'
import { upgradeWebSocket } from '.'

describe('upgradeWebSocket middleware', () => {
  const server = new EventTarget()

  // @ts-expect-error Cloudflare API
  globalThis.WebSocketPair = class {
    0: WebSocket // client
    1: WebSocket // server
    constructor() {
      this[0] = {} as WebSocket
      this[1] = server as WebSocket
    }
  }

  const app = new Hono()

  const wsPromise = new Promise((resolve) =>
    app.get(
      '/ws',
      upgradeWebSocket(() => ({
        onMessage(evt, ws) {
          resolve([evt.data, ws.readyState || 1])
        },
      }))
    )
  )
  it('Should receive message and readyState is valid', async () => {
    const sendingData = Math.random().toString()
    await app.request('/ws', {
      headers: {
        Upgrade: 'websocket',
      },
    })
    server.dispatchEvent(
      new MessageEvent('message', {
        data: sendingData,
      })
    )

    expect([sendingData, 1]).toStrictEqual(await wsPromise)
  })
  it('Should call next() when header does not have upgrade', async () => {
    const next = vi.fn()
    await upgradeWebSocket(() => ({}))(
      new Context(
        new Request('http://localhost', {
          headers: {
            Upgrade: 'example',
          },
        })
      ),
      next
    )
    expect(next).toBeCalled()
  })

  it('Should use waitUntil for async onMessage handlers', async () => {
    const wsServer = new EventTarget()

    // @ts-expect-error Cloudflare API
    globalThis.WebSocketPair = class {
      0: WebSocket
      1: WebSocket
      constructor() {
        this[0] = {} as WebSocket
        this[1] = wsServer as WebSocket
      }
    }

    const waitUntilFn = vi.fn()
    const asyncApp = new Hono()

    const messageHandled = new Promise<void>((resolve) =>
      asyncApp.get(
        '/ws-async',
        upgradeWebSocket(() => ({
          async onMessage() {
            await new Promise((r) => setTimeout(r, 10))
            resolve()
          },
        }))
      )
    )

    await asyncApp.request('/ws-async', {
      headers: {
        Upgrade: 'websocket',
      },
    }, undefined, {
      waitUntil: waitUntilFn,
      passThroughOnException: () => {},
    } as ExecutionContext)

    wsServer.dispatchEvent(new MessageEvent('message', { data: 'hello' }))
    await messageHandled

    expect(waitUntilFn).toHaveBeenCalledTimes(1)
    expect(waitUntilFn).toHaveBeenCalledWith(expect.any(Promise))
  })
})
