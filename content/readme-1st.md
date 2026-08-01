---
title: README.1ST
description: A partially recovered text file from a 3.5-inch disk. Three sectors were unreadable. Some of them came back.
tags:
  - thoughts
created: 2026-08-01
id: blog
layout: article
growth: becoming
---

The disk was in a box of disks, and the box was in a cupboard, and the cupboard was not mine.

Most of them were empty or unreadable. This one mounted. It contained a single file, 4,096 bytes, named `README.1ST` — the old convention, the name chosen so it would sort above everything else in a directory listing and be the first thing you saw. Somebody wanted this read first.

Three sectors came back with errors. I ran the recovery twice more and got a little further each time.[^recovery] What follows is the file as I have it. The damaged regions are marked. **Click a damaged region to run the recovery pass on it** — it takes a few attempts, the way it did on the disk.

```
SUBSURFACES DISK UTILITY 2.1
Reading A:\README.1ST ................ 4096 bytes

  sector 01  OK
  sector 02  OK
  sector 03  OK
  sector 04  READ ERROR  (CRC mismatch)
  sector 05  OK
  sector 06  READ ERROR  (CRC mismatch)
  sector 07  OK
  sector 08  READ ERROR  (no address mark)

3 sectors damaged. Attempt recovery? [Y/n] _
```

---

If you are reading this then the machine still turns on, which I did not assume.

I am writing it down because I have started to notice the shape of the failure, and the shape is not what people say it is. Nobody warns you correctly. They tell you that you will forget things. That is not what happens.

```telescopic
- ▓▓▓▓▓▓▓▓ sector 04 — unreadable ▓▓▓▓▓▓▓▓
	- retrying, pass 1 of 3 —
		- partial: we did not lose the photographs.
			- We lost the *index* to the photographs.
				- Which is a different loss, and a worse one, because the box is still in the cupboard and every single frame is still on the film and none of it can be *reached*.
					- Nothing is gone. It is all just unaddressed.
						- ▶ volume label recovered, characters 1–3: **PER**
```

That is the whole thing, really. That is what I wanted to get down before the drive went.

Everyone plans for deletion. You back things up against deletion. But deletion is rare and honest — the file is gone, you know it is gone, you grieve it once and correctly. What actually happens is so much quieter than that.

```telescopic
- ▓▓▓▓▓▓▓▓ sector 06 — unreadable ▓▓▓▓▓▓▓▓
	- retrying, pass 1 of 3 —
		- partial: the format outlives the reader.
			- Every disk in that cupboard is intact. The oxide is fine. The bits are *there*, in their millions, in perfect order,
				- and there is not one machine left in this house that knows what they mean.
					- The data did not decay. The *understanding* decayed, and it took the data with it while leaving it completely untouched.
						- This is the failure mode nobody designs against, because from the inside it looks exactly like everything being fine.
							- ▶ volume label recovered, characters 4–7: **SIST**
```

So: write things down in the dumbest possible format. Plain text. One file. A name that sorts first.

Do not be clever about it. Clever is what needs a reader.

I have been thinking about what the opposite of losing something is, and I do not think it is *keeping* it. Keeping is passive; keeping is the cupboard, and the cupboard is where all of this went. It is something more like maintenance — a thing you have to keep doing, badly, forever, or it stops.

```telescopic
- ▓▓▓▓▓▓▓▓ sector 08 — no address mark ▓▓▓▓▓▓▓▓
	- retrying, pass 1 of 3 —
		- pass 2 of 3 — (this one is worse than the others; the head is finding nothing to anchor to)
			- partial: so this is the instruction, and it is the only one.
				- Keep the machine warm. Keep something running that can still read the old shapes.
					- A garden is not an archive. An archive is a promise that someone later will care; a garden is *someone caring, currently*.
						- That is a much smaller claim and it is the only one anybody has ever actually kept.
							- ▶ volume label recovered, characters 8–11: **ENCE**
```

The file ends there. There is no signature, and the timestamp is 1980-01-01 00:00, which is what a dead clock battery writes.

---

## The volume label

The three recovered fragments are not part of the text. They sit in the disk's header — the label given to the volume when it was formatted, which is why it survived in pieces when the body did not.

Assembled, it reads:

> **PERSISTENCE**

That is a boot volume name. And the machine at [os.subsurfaces.net](https://os.subsurfaces.net) will still take one — the loader accepts a volume label as a seed and brings up that specific machine, deterministically, the same way every time:

```
A:\> boot /seed=PERSISTENCE
```

Which resolves to `os.subsurfaces.net/?seed=PERSISTENCE`, and which is, as far as I can tell, a machine that has been sitting there waiting for its own disk to come back.[^machine]

I would recommend running it. It is the first thing the file asked for.

[^recovery]: The third pass added eleven bytes over the second. There will not be a fourth; the drive made a noise on the last attempt that I have decided to interpret as a limit.
[^machine]: Other labels also boot. They bring up other machines, and those machines are real and deterministic and nobody has ever formatted a disk with them. I have tried a few. I do not recommend making a habit of it.
