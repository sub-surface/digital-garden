/**
 * MDX JSX → static HTML + island placeholders, for the HTML note renderer.
 *
 * Notes are written in MDX (gotcha #10): inline HTML is JSX (`className`),
 * and a few notes use components (`<Query sort="-date" />`). Compiling every
 * note to JavaScript just to honour those few made each note a 50–290 KB
 * chunk. This plugin lets the one markdown pipeline emit plain HTML instead:
 *
 * - lowercase JSX (`<div className="x">`) becomes an ordinary element;
 * - a registered component becomes
 *     <div data-island="Query" data-props='{"sort":"-date"}'>…children…</div>
 *   (a <span> when used inline), which the client hydrates in place;
 * - attribute expressions are evaluated ONLY if they are literals (numbers,
 *   strings, booleans, arrays/objects of literals) — read from the parsed
 *   estree, never eval'd;
 * - anything else (unknown component, a computed expression, import/export)
 *   is a build error carried into the page as a visible red block, never a
 *   silent hole (design law: failure must be visible).
 */

import type { Root } from "mdast"
import { visit, SKIP } from "unist-util-visit"

interface JsxAttribute {
  type: "mdxJsxAttribute" | "mdxJsxExpressionAttribute"
  name?: string
  value?: string | null | { type: "mdxJsxAttributeValueExpression"; value: string; data?: { estree?: any } }
}

interface JsxNode {
  type: "mdxJsxFlowElement" | "mdxJsxTextElement"
  name: string | null
  attributes: JsxAttribute[]
  children: any[]
  data?: Record<string, unknown>
}

export class IslandError extends Error {}

/** JSX attribute names → HTML attribute names, for the lowercase-element path. */
const HTML_ATTR: Record<string, string> = { className: "class", htmlFor: "for" }

/** Evaluate a literal-only estree expression. Throws on anything computed. */
export function literalValue(node: any): unknown {
  switch (node?.type) {
    case "Literal":
      return node.value
    case "TemplateLiteral":
      if (node.expressions.length) throw new IslandError("template literal with ${} is not a literal")
      return node.quasis.map((q: any) => q.value.cooked).join("")
    case "ArrayExpression":
      return node.elements.map((el: any) => {
        if (!el || el.type === "SpreadElement") throw new IslandError("array holes/spreads are not literals")
        return literalValue(el)
      })
    case "ObjectExpression": {
      const out: Record<string, unknown> = {}
      for (const prop of node.properties) {
        if (prop.type !== "Property" || prop.computed || prop.kind !== "init" || prop.method) {
          throw new IslandError("object spreads/computed keys/methods are not literals")
        }
        const key = prop.key.type === "Identifier" ? prop.key.name : String(prop.key.value)
        out[key] = literalValue(prop.value)
      }
      return out
    }
    case "UnaryExpression":
      if (node.operator === "-" && node.argument?.type === "Literal" && typeof node.argument.value === "number") {
        return -node.argument.value
      }
      throw new IslandError(`operator ${node.operator} is not a literal`)
    case "Identifier":
      if (node.name === "undefined") return undefined
      throw new IslandError(`identifier "${node.name}" is not a literal`)
    default:
      throw new IslandError(`${node?.type ?? "unknown"} expression is not a literal`)
  }
}

function attributeValue(attr: JsxAttribute): unknown {
  if (attr.value === null || attr.value === undefined) return true // <X flag />
  if (typeof attr.value === "string") return attr.value
  const program = attr.value.data?.estree
  const statement = program?.body?.[0]
  if (!statement || statement.type !== "ExpressionStatement") {
    throw new IslandError(`could not read {${attr.value.value}}`)
  }
  return literalValue(statement.expression)
}

function errorNode(message: string, inline: boolean) {
  return {
    type: inline ? "emphasis" : "paragraph",
    data: { hName: inline ? "span" : "div", hProperties: { className: ["note-build-error"], role: "alert" } },
    children: [{ type: "text", value: `⚠ ${message}` }],
  }
}

export interface RemarkIslandsOptions {
  islands: readonly string[]
}

/** Problems are collected on `file.data.islandErrors` (one shared processor
 *  renders every note, so per-call callbacks would leak between notes). */
export function remarkIslands({ islands }: RemarkIslandsOptions) {
  const known = new Set(islands)
  return (tree: Root, file: { data: Record<string, unknown> }) => {
    const errors: string[] = ((file.data.islandErrors as string[]) ??= [])
    const onError = (message: string) => errors.push(message)
    visit(tree, (node: any, index, parent: any) => {
      if (node.type === "mdxjsEsm") {
        const message = "import/export is not supported in notes"
        onError(message)
        parent.children.splice(index!, 1, errorNode(message, false))
        return SKIP
      }
      if (node.type === "mdxFlowExpression" || node.type === "mdxTextExpression") {
        // `{/* comment */}` is common and harmless; anything else is code.
        const src = String(node.value ?? "").trim()
        if (/^\/\*[\s\S]*\*\/$/.test(src) || src === "") {
          parent.children.splice(index!, 1)
          return [SKIP, index!]
        }
        const message = `expression {${src.slice(0, 40)}} is not supported in notes`
        onError(message)
        parent.children.splice(index!, 1, errorNode(message, node.type === "mdxTextExpression"))
        return SKIP
      }
      if (node.type !== "mdxJsxFlowElement" && node.type !== "mdxJsxTextElement") return
      const jsx = node as JsxNode
      const inline = jsx.type === "mdxJsxTextElement"
      const name = jsx.name

      try {
        if (!name) {
          // <>fragment</> — keep the children, drop the wrapper.
          parent.children.splice(index!, 1, ...jsx.children)
          return [SKIP, index!]
        }

        if (/^[a-z]/.test(name)) {
          const props: Record<string, unknown> = {}
          for (const attr of jsx.attributes) {
            if (attr.type !== "mdxJsxAttribute" || !attr.name) throw new IslandError("spread attributes are not supported")
            const value = attributeValue(attr)
            if (attr.name === "style" && value && typeof value === "object") {
              props.style = Object.entries(value as Record<string, unknown>)
                .map(([k, v]) => `${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}:${v}`)
                .join(";")
            } else {
              props[HTML_ATTR[attr.name] ?? attr.name] = value
            }
          }
          Object.assign(jsx, { type: inline ? "emphasis" : "paragraph", data: { hName: name, hProperties: props } })
          return
        }

        if (!known.has(name)) throw new IslandError(`<${name}> is not a registered component`)
        const props: Record<string, unknown> = {}
        for (const attr of jsx.attributes) {
          if (attr.type !== "mdxJsxAttribute" || !attr.name) throw new IslandError(`<${name}>: spread attributes are not supported`)
          props[attr.name] = attributeValue(attr)
        }
        Object.assign(jsx, {
          type: inline ? "emphasis" : "paragraph",
          data: {
            hName: inline ? "span" : "div",
            hProperties: { dataIsland: name, dataProps: JSON.stringify(props) },
          },
        })
      } catch (err) {
        const message = err instanceof IslandError ? err.message : `could not render <${name}>: ${String(err)}`
        onError(message)
        parent.children.splice(index!, 1, errorNode(message, inline))
        return SKIP
      }
    })
  }
}
