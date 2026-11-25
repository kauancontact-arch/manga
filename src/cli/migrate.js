import { migrate, closeDb } from '../core/db.js';

const applied = migrate();
console.log(applied.length ? `[migrate] ${applied.length} migration(s) aplicada(s).` : '[migrate] nada a fazer.');
closeDb();
