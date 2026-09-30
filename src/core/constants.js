// Réglages partagés par plusieurs modules du jeu.

// La boucle d'animation tournait 2 fois par image (≈120 fois/s sur un écran 60 Hz).
// Les vitesses "par image" réglées à l'époque sont conservées via ce facteur.
export const LEGACY_TICK_RATE = 120;

export const FLIGHT_CRUISE_SPEED = 50;   // vitesse du TIE en vol (unités/s)
export const FLIGHT_BOOST_SPEED = 700;   // avec MAJ (Shift) maintenue (l'Executor fait ~26 000 unités de long)
export const BATTLE_Y = 250;             // altitude moyenne de la bataille (au-dessus de la coque de l'Executor, y ≈ -80)
export const BATTLE_MIN_Z = 260;         // la bataille reste devant la passerelle (vitres ≈ z 150, canon z 190)
