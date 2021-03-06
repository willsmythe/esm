import Visitor from "../visitor.js"

import getNamesFromPattern from "../parse/get-names-from-pattern.js"
import isShadowed from "../parse/is-shadowed.js"
import keys from "../util/keys.js"
import maybeIdentifier from "../parse/maybe-identifier.js"
import overwrite from "../parse/overwrite.js"
import shared from "../shared.js"

function init() {
  const shadowedMap = new Map

  class TemporalVisitor extends Visitor {
    reset(options) {
      this.changed = false
      this.magicString = null
      this.possibleIndexes = null
      this.runtimeName = null
      this.temporalBindings = null

      if (options !== void 0) {
        this.magicString = options.magicString
        this.possibleIndexes = options.possibleIndexes
        this.runtimeName = options.runtimeName
        this.temporalBindings = options.temporalBindings
      }
    }

    visitIdentifier(path) {
      const node = path.getValue()
      const { name } = node

      if (! Reflect.has(this.temporalBindings, name) ||
          isShadowed(path, name, shadowedMap)) {
        return
      }

      const { magicString, runtimeName } = this

      maybeIdentifier(path, (node, parent) => {
        this.changed = true

        const { end, start } = node

        if (parent.shorthand) {
          magicString
            .prependLeft(
              end,
              ":" + runtimeName + '.a("' + name + '",' + name + ")"
            )

          return
        }

        let prefix
        let suffix

        if (parent.type === "NewExpression") {
          prefix = "("
          suffix = ")"
        } else {
          prefix = ""
          suffix = ""
        }

        const code =
          prefix +
          runtimeName + '.a("' + name + '",' + name + ")" +
          suffix

        overwrite(this, start, end, code)
      })
    }

    visitExportDefaultDeclaration(path) {
      const node = path.getValue()
      const { declaration } = node

      if (declaration.type !== "FunctionDeclaration") {
        // Instrument for non-hoisted values.
        this.changed = true

        this.magicString.appendRight(
          declaration.end,
          this.runtimeName + '.j(["default"]);'
        )
      }

      path.call(this, "visitWithoutReset", "declaration")
    }

    visitExportNamedDeclaration(path) {
      const node = path.getValue()
      const { declaration, specifiers } = node
      const initees = { __proto__: null }

      if (declaration !== null) {
        const { type } = declaration

        if (type === "ClassDeclaration") {
          initees[declaration.id.name] = true
        } else if (type === "VariableDeclaration") {
          // Instrument for exported variable lists:
          // export let name1, name2, ..., nameN
          for (const { id } of declaration.declarations) {
            const names = getNamesFromPattern(id)

            for (const name of names) {
              initees[name] = true
            }
          }
        }
      } else if (node.source === null) {
        // Instrument for exported specifiers:
        // export { name1, name2, ..., nameN }
        for (const specifier of specifiers) {
          initees[specifier.exported.name] = true
        }
      } else {
        // Instrument for re-exported specifiers of an imported module:
        // export { name1, name2, ..., nameN } from "mod"
        for (const specifier of specifiers) {
          initees[specifier.exported.name] = true
        }
      }

      const initeeNames = keys(initees)

      if (initeeNames.length !== 0) {
        this.changed = true

        const { end } = declaration || node

        this.magicString.appendRight(
          end,
          ";" + this.runtimeName + ".j(" + JSON.stringify(initeeNames) + ");"
        )
      }

      if (declaration !== null) {
        path.call(this, "visitWithoutReset", "declaration")
      }
    }
  }

  return new TemporalVisitor
}

export default shared.inited
  ? shared.module.visitorTemporal
  : shared.module.visitorTemporal = init()
