``` dataviewjs
const allNotes = dv.pages();
const randomNotes = [];

while (randomNotes.length < 3) {
    const index = Math.floor(Math.random() * allNotes.length);
    const note = allNotes[index];
    if (note && !randomNotes.includes(note)) {
        randomNotes.push(note);
    }
}

if (randomNotes.length > 0) {
    dv.table(["File"], randomNotes.map(note => [note.file.link]));
}
```
