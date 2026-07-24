export interface MotionPathPoint {
  x: number
  y: number
}

const tokenPattern = /[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/gi

const point = (x: number, y: number): MotionPathPoint => ({ x, y })
const sampleLine = (to: MotionPathPoint) => [to]

const sampleQuadratic = (
  from: MotionPathPoint,
  control: MotionPathPoint,
  to: MotionPathPoint,
) => Array.from({ length: 10 }, (_, index) => {
  const t = (index + 1) / 10
  const inverse = 1 - t
  return point(
    inverse * inverse * from.x + 2 * inverse * t * control.x + t * t * to.x,
    inverse * inverse * from.y + 2 * inverse * t * control.y + t * t * to.y,
  )
})

const sampleCubic = (
  from: MotionPathPoint,
  first: MotionPathPoint,
  second: MotionPathPoint,
  to: MotionPathPoint,
) => Array.from({ length: 14 }, (_, index) => {
  const t = (index + 1) / 14
  const inverse = 1 - t
  return point(
    inverse ** 3 * from.x + 3 * inverse * inverse * t * first.x + 3 * inverse * t * t * second.x + t ** 3 * to.x,
    inverse ** 3 * from.y + 3 * inverse * inverse * t * first.y + 3 * inverse * t * t * second.y + t ** 3 * to.y,
  )
})

const reflect = (control: MotionPathPoint | undefined, around: MotionPathPoint) => {
  if (!control) return around
  return point(around.x * 2 - control.x, around.y * 2 - control.y)
}

/** Parses the normalized SVG-like path syntax used by p:animMotion. */
export const parsePptxMotionPath = (source: string): MotionPathPoint[] => {
  const tokens = source.match(tokenPattern) || []
  const points: MotionPathPoint[] = []
  let index = 0
  let command = ''
  let current = point(0, 0)
  let subpathStart = current
  let lastCubicControl: MotionPathPoint | undefined
  let lastQuadraticControl: MotionPathPoint | undefined

  const number = () => Number(tokens[index++])
  const hasNumbers = (count: number) => {
    return index + count <= tokens.length && tokens.slice(index, index + count).every(token => !/^[a-z]$/i.test(token))
  }
  const resolve = (x: number, y: number, relative: boolean) => {
    return relative ? point(current.x + x, current.y + y) : point(x, y)
  }
  const append = (next: MotionPathPoint[]) => {
    for (const item of next) {
      if (points.length >= 500) return
      points.push(item)
    }
  }

  while (index < tokens.length && points.length < 500) {
    if (/^[a-z]$/i.test(tokens[index])) command = tokens[index++]
    if (!command) break
    const relative = command === command.toLowerCase()
    const kind = command.toUpperCase()
    if (kind === 'E') break
    if (kind === 'Z') {
      append(sampleLine(subpathStart))
      current = subpathStart
      lastCubicControl = undefined
      lastQuadraticControl = undefined
      command = ''
      continue
    }

    if (kind === 'M' && hasNumbers(2)) {
      current = resolve(number(), number(), relative)
      subpathStart = current
      append([current])
      lastCubicControl = undefined
      lastQuadraticControl = undefined
      command = relative ? 'l' : 'L'
    }
    else if (kind === 'L' && hasNumbers(2)) {
      const next = resolve(number(), number(), relative)
      append(sampleLine(next))
      current = next
      lastCubicControl = undefined
      lastQuadraticControl = undefined
    }
    else if (kind === 'H' && hasNumbers(1)) {
      const value = number()
      const next = point(relative ? current.x + value : value, current.y)
      append(sampleLine(next))
      current = next
      lastCubicControl = undefined
      lastQuadraticControl = undefined
    }
    else if (kind === 'V' && hasNumbers(1)) {
      const value = number()
      const next = point(current.x, relative ? current.y + value : value)
      append(sampleLine(next))
      current = next
      lastCubicControl = undefined
      lastQuadraticControl = undefined
    }
    else if (kind === 'C' && hasNumbers(6)) {
      const first = resolve(number(), number(), relative)
      const second = resolve(number(), number(), relative)
      const next = resolve(number(), number(), relative)
      append(sampleCubic(current, first, second, next))
      current = next
      lastCubicControl = second
      lastQuadraticControl = undefined
    }
    else if (kind === 'S' && hasNumbers(4)) {
      const first = reflect(lastCubicControl, current)
      const second = resolve(number(), number(), relative)
      const next = resolve(number(), number(), relative)
      append(sampleCubic(current, first, second, next))
      current = next
      lastCubicControl = second
      lastQuadraticControl = undefined
    }
    else if (kind === 'Q' && hasNumbers(4)) {
      const control = resolve(number(), number(), relative)
      const next = resolve(number(), number(), relative)
      append(sampleQuadratic(current, control, next))
      current = next
      lastQuadraticControl = control
      lastCubicControl = undefined
    }
    else if (kind === 'T' && hasNumbers(2)) {
      const control = reflect(lastQuadraticControl, current)
      const next = resolve(number(), number(), relative)
      append(sampleQuadratic(current, control, next))
      current = next
      lastQuadraticControl = control
      lastCubicControl = undefined
    }
    else break
  }

  return points
}

export interface MotionPathKeyframe extends Record<string, string | number> {
  transform: string
  offset: number
}

export const createMotionPathKeyframes = (
  path: string,
  viewportWidth = 1000,
  viewportHeight = 562.5,
): MotionPathKeyframe[] => {
  const points = parsePptxMotionPath(path)
  if (points.length < 2) return []
  const origin = points[0]
  const distances = [0]
  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1]
    const current = points[index]
    const dx = (current.x - previous.x) * viewportWidth
    const dy = (current.y - previous.y) * viewportHeight
    distances.push(distances[index - 1] + Math.hypot(dx, dy))
  }
  const total = distances[distances.length - 1]
  const pixel = (value: number) => {
    const rounded = Math.round(value * 100000) / 100000
    return Object.is(rounded, -0) ? 0 : rounded
  }
  return points.map((current, index) => ({
    transform: `translate3d(${pixel((current.x - origin.x) * viewportWidth)}px, ${pixel((current.y - origin.y) * viewportHeight)}px, 0)`,
    offset: total ? distances[index] / total : index / (points.length - 1),
  }))
}
