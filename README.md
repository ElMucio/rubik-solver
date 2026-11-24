# Rubik Solver

> **EN** — Browser-based Rubik's Cube solver. Enter the colors of the six faces, and the Kociemba
> two-phase algorithm finds a near-optimal solution (typically 18–20 moves) in milliseconds, then
> plays it back on an animated 3D cube. Vanilla JavaScript and CSS 3D transforms, no libraries.

Risolutore del cubo di Rubik che gira interamente nel browser. Si inseriscono i colori delle sei
facce, l'algoritmo trova una soluzione quasi ottimale e la mostra mossa per mossa su un cubo 3D animato.

## Funzioni

- **Editor delle 6 facce** sulla rete 2D del cubo, con tavolozza colori (tasti `1`–`6` per scegliere il colore).
- **Controllo dello stato**: un cubo impossibile (colori sbagliati, pezzi ruotati in modo non valido) viene segnalato prima di risolverlo.
- **Soluzione con l'algoritmo a due fasi di Kociemba**: di solito 18–20 mosse, calcolate in pochi millisecondi.
- **Riproduzione animata in 3D**, con velocità regolabile e quattro punti di vista della telecamera.
- **Mischia** e **pattern classici** pronti: scacchiera, cubo nel cubo, superflip, croce su 6 facce.
- **Copia della sequenza** di mosse in notazione standard (U, R, F, D, L, B).

## Avvio

Nessuna installazione: basta aprire `index.html` nel browser (funziona anche da file locale).

## Struttura

```
index.html          interfaccia
styles.css          stile e cubo 3D in CSS
js/cube-model.js    modello del cubo, mosse, conversione facce/pezzi, validazione
js/kociemba.js      algoritmo a due fasi di Kociemba
js/cube3d.js        rendering 3D e animazione delle rotazioni
js/app.js           collegamento tra editor, risolutore e riproduzione
```

## Note

- I font sono caricati da Google Fonts: senza connessione la pagina funziona lo stesso, con i font di sistema.
- L'algoritmo a due fasi è stato ideato da Herbert Kociemba; questa è un'implementazione in JavaScript.

---

Sviluppato da [Luca Sonno](https://lucasonno.com) con l'assistenza di Claude Code. Licenza [MIT](LICENSE).
