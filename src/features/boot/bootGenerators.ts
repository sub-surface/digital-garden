/**
 * bootGenerators.ts — Content generators for boot sequence
 * Each returns a sequence of boot event lines with reveal modes
 */

import { SeededRNG } from "./bootRng"
import { BootEvent, RevealMode, BootTone } from "./bootTypes"

export class BootGenerator {
  private rng: SeededRNG
  private eventIdCounter = 0

  constructor(seed: number) {
    this.rng = new SeededRNG(seed)
  }

  private nextId(): string {
    return `evt-${++this.eventIdCounter}`
  }

  private event(
    text: string,
    reveal: RevealMode = "type",
    tone: BootTone = "neutral"
  ): BootEvent {
    return {
      id: this.nextId(),
      kind: "output",
      text,
      reveal,
      tone,
      duration: 0,
    }
  }

  /**
   * System checks: memory, disk, network, time
   */
  systemChecks(): BootEvent[] {
    const events: BootEvent[] = []
    const rng = this.rng.fork()

    events.push(this.event("$ system-check", "type", "neutral"))
    events.push(this.event("", "instant"))

    const checks = [
      "  MEMORY   okay | 16.0 GiB available",
      "  DISK     okay | 412 GiB free",
      "  NETWORK  okay | connected",
      "  TIME     okay | synced",
      "  ENTROPY  okay | ready",
    ]

    for (const check of checks) {
      const tone: BootTone = rng.float() > 0.15 ? "neutral" : rng.choice(["warning", "anomaly"])
      events.push(this.event(check, "type", tone))
    }

    events.push(this.event("", "instant"))
    return events
  }

  /**
   * Memory dump: filesystem tree with interesting paths
   */
  memoryDump(): BootEvent[] {
    const events: BootEvent[] = []
    const rng = this.rng.fork()

    events.push(this.event("$ cat /sys/memory.log", "type", "neutral"))
    events.push(this.event("", "instant"))

    const paths = [
      "root",
      "  /bin/init       executable",
      "  /etc/config     readable",
      "  /var/state      mutable",
      "  /opt/lib        unknown",
      "  /home/ghost     locked",
    ]

    for (const path of paths) {
      events.push(this.event(path, "type", rng.float() > 0.8 ? "warning" : "neutral"))
    }

    events.push(this.event("", "instant"))
    return events
  }

  /**
   * Network packets: simulated traffic logs
   */
  networkPackets(): BootEvent[] {
    const events: BootEvent[] = []
    const rng = this.rng.fork()

    events.push(this.event("$ tcpdump -i eth0 count=8", "type", "neutral"))
    events.push(this.event("", "instant"))

    for (let i = 0; i < 8; i++) {
      const ip1 = `192.168.${rng.int(256)}.${rng.int(256)}`
      const ip2 = `10.0.${rng.int(256)}.${rng.int(256)}`
      const port = 1024 + rng.int(64000)
      const tone: BootTone = rng.float() > 0.85 ? "anomaly" : "neutral"
      events.push(
        this.event(
          `  ${ip1}:${port} > ${ip2}:443 [SYN]`,
          "burst",
          tone
        )
      )
    }

    events.push(this.event("", "instant"))
    return events
  }

  /**
   * Artistic: pseudopoetic fragments, glitches, dreams
   */
  artistic(): BootEvent[] {
    const events: BootEvent[] = []
    const rng = this.rng.fork()

    const fragments = [
      "woke up yesterday tomorrow",
      "time drifting between clocks",
      "memory → void → memory",
      "recursive dreams of starting up",
      "signals collapse into noise",
      "listening to the color of mathematics",
    ]

    events.push(this.event("$ /usr/bin/dream", "type", "neutral"))
    events.push(this.event("", "instant"))

    for (let i = 0; i < 3; i++) {
      const line = rng.choice(fragments)
      events.push(this.event(`  ∴ ${line}`, "type", "artistic"))
    }

    events.push(this.event("", "instant"))
    return events
  }

  /**
   * Generator sequence: alternates between types to create variety
   */
  generate(count: number = 100): BootEvent[] {
    const allEvents: BootEvent[] = []
    const generators = [
      () => this.systemChecks(),
      () => this.memoryDump(),
      () => this.networkPackets(),
      () => this.artistic(),
    ]

    let generatorIndex = 0
    while (allEvents.length < count) {
      const generator = generators[generatorIndex % generators.length]
      const batch = generator()
      allEvents.push(...batch)
      generatorIndex++
    }

    return allEvents.slice(0, count)
  }
}
