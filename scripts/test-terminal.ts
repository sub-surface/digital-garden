import assert from "node:assert/strict"
import { COMMANDS, COMMAND_NAMES, lookup } from "../src/features/terminal/commands"
import type { TerminalContext } from "../src/features/terminal/types"

const seen = new Map<string, string>()
for (const command of COMMANDS) {
  for (const name of [command.name, ...(command.aliases ?? [])]) {
    assert(!seen.has(name), `duplicate terminal name '${name}' (${seen.get(name)} / ${command.name})`)
    seen.set(name, command.name)
    assert.equal(lookup(name), command, `lookup('${name}') must resolve to ${command.name}`)
  }
  assert(command.help.usage.length > 0, `${command.name} needs usage text`)
  assert(command.help.description.length > 0, `${command.name} needs a description`)
}

assert.deepEqual([...seen.keys()].sort(), [...COMMAND_NAMES], "completion names must derive from the registry")

const helpOutput: string[] = []
const help = lookup("help")!
const noop = () => undefined
const context: TerminalContext = {
  surface: "page",
  startSession: noop,
  endSession: noop,
  print: (line) => { helpOutput.push(line) },
  printLines: (lines) => { helpOutput.push(...lines) },
  clear: noop,
  replaceLastLines: noop,
  history: () => [],
  notes: () => [],
  fetchNote: async () => null,
  open: noop,
  navigate: noop,
  user: () => null,
  requireLogin: noop,
  theme: { get: () => "dark", set: noop },
  seed: { value: 0, display: "0x00000000", reseed: noop },
  music: {
    tracks: [], currentTrackIndex: 0, isPlaying: false, volume: 0,
    playTrack: noop, togglePlay: noop, nextTrack: noop, prevTrack: noop, setVolume: noop,
  },
}
assert.deepEqual(help.complete?.(context, ""), COMMAND_NAMES, "help argument completion must use every command name")
await help.run(context, [])

const listedHelpNames = new Set(helpOutput.flatMap((line) => line.trim().split(/\s+/)))
for (const command of COMMANDS) {
  assert(listedHelpNames.has(command.name), `help output omitted '${command.name}'`)
}

console.log(`terminal registry: ${COMMANDS.length} commands, ${COMMAND_NAMES.length} names; help/completion in sync`)
