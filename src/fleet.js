// ===================================================================
// FLOTTE REBELLE — Home One (3 parties), Liberty, frégate, CR-90, transport
// ===================================================================
// - arrivée en sortie d'hyperespace (étirement + flash), une à une
// - navigation entre des points aléatoires devant la passerelle, en évitant
//   les destroyers impériaux (le décor + ceux qui tournent) et les autres croiseurs
// - dégâts : trous dans la coque, débris, foyers d'incendie
// - une partie détruite explose avec une gerbe de débris ;
//   si c'est le MILIEU, l'avant et l'arrière dérivent chacun de leur côté
// - un croiseur entièrement détruit est remplacé plus tard par un nouveau

import * as THREE from 'three';
import { segmentSphere, makeDamageable, hullTime } from './weapons.js';

export const FLEET = {
    COUNT: 5,                      // nombre de croiseurs en même temps
    SPEED: 24,                     // vitesse de croisière (unités/s)
    TURN_RATE: 0.09,               // virage max (rad/s)
    FIRST_ARRIVAL: 1.5,            // 1re arrivée (s après le début de la bataille)
    ARRIVAL_GAP: [4, 8],           // écart entre les arrivées suivantes
    RESPAWN_DELAY: [20, 35],       // remplacement d'un croiseur détruit
    ARRIVAL_TIME: 1.8,             // durée de la sortie d'hyperespace
    JUMP_DISTANCE: 4000,
    SHIP_RADIUS: 380,              // "bulle" utilisée pour les évitements
    ZONE: { minZ: 1300, maxZ: 3300, maxX: 1900, minY: 220, maxY: 750 }   // au-dessus de la coque de l'Executor
};

const X = new THREE.Vector3(1, 0, 0);   // avant d'un croiseur dans son propre repère
const UP = new THREE.Vector3(0, 1, 0);

function rand(a, b) { return a + Math.random() * (b - a); }

export class RebelFleet {

    /**
     * ctx = {
     *   scene, fx, debris,
     *   obstacles: () => [{ center: Vector3, radius }],   // destroyers impériaux
     *   onArrive(ship), onPartDestroyed(ship, part), onShipDestroyed(ship)
     * }
     */
    constructor(ctx) {
        this.ctx = ctx;
        this.types = {};           // type → { parts:[modèles], hits, radius, speed }
        this.ships = [];
        this.timers = [];          // arrivées programmées (secondes restantes)
        this.elapsed = 0;
        this.active = false;       // la flotte n'est là que pendant la bataille
        this._ray = new THREE.Raycaster();
    }

    /**
     * Ajoute un type de vaisseau.
     * def = { parts: [modèles] (1 ou 3 parties : avant / milieu / arrière),
     *         hits: tirs par partie, radius: taille (évitements, explosions), speed }
     */
    addType(name, def) {
        const first = !this._hasTypes();
        this.types[name] = { name, speed: FLEET.SPEED, zone: FLEET.ZONE, ...def };   // zone : où il navigue
        if (first && this.active) this._scheduleArrivals();
    }

    _hasTypes() { return Object.keys(this.types).length > 0; }

    // de la variété : on choisit en priorité un type absent de la bataille
    _pickType() {
        const names = Object.keys(this.types);
        const present = new Set(this.ships.filter(s => s.state !== 'dead').map(s => s.def.name));
        const missing = names.filter(n => !present.has(n));
        const pool = missing.length ? missing : names;
        return this.types[pool[Math.floor(Math.random() * pool.length)]];
    }

    _scheduleArrivals() {
        this.timers = [];
        let t = FLEET.FIRST_ARRIVAL;
        for (let i = this.ships.length; i < FLEET.COUNT; i++) {
            this.timers.push(t);
            t += rand(...FLEET.ARRIVAL_GAP);
        }
    }

    /**
     * Bataille ON (canon activé / vol en TIE) : les croiseurs arrivent un par un.
     * Bataille OFF : les croiseurs intacts repartent en hyperespace, les épaves disparaissent.
     */
    setActive(on) {
        if (on === this.active) return;
        this.active = on;
        if (on) {
            if (this._hasTypes()) this._scheduleArrivals();
            return;
        }
        this.timers = [];
        for (const ship of this.ships) {
            if (ship.state === 'cruise') {
                ship.state = 'leave';
                ship.t = 0;
            } else if (ship.state !== 'leave') {
                ship.state = 'dead';
                this.ctx.scene.remove(ship.group);
            }
        }
    }

    // ---------------------------------------------------------------
    // Création / arrivée
    // ---------------------------------------------------------------
    _obstacleList(exclude = null) {
        const list = this.ctx.obstacles().slice();
        for (const s of this.ships) {
            if (s === exclude || s.state === 'dead') continue;
            list.push({ center: s.group.position, radius: s.radius });
        }
        return list;
    }

    _freePoint(exclude = null, radius = FLEET.SHIP_RADIUS, zone = FLEET.ZONE) {
        const Z = zone;
        const obs = this._obstacleList(exclude);
        const p = new THREE.Vector3();
        for (let tries = 0; tries < 25; tries++) {
            p.set(rand(-Z.maxX, Z.maxX), rand(Z.minY, Z.maxY), rand(Z.minZ, Z.maxZ));
            if (obs.every(o => p.distanceTo(o.center) > o.radius + radius + 150)) return p;
        }
        return p;
    }

    _spawnShip() {
        const def = this._pickType();
        const group = new THREE.Group();   // position + orientation (+x = avant)
        const body = new THREE.Group();    // étirement pendant l'hyperespace
        group.add(body);

        const parts = def.parts.map((tpl, index) => {
            const part = tpl.clone();
            part.userData = {
                index, hits: 0, destroyed: false, flash: 0,
                fires: [], fireTimer: 0,
                drift: null
            };
            part.userData.damage = makeDamageable(part);
            part.traverse(m => {
                if (m.isMesh) {
                    const mats = Array.isArray(m.material) ? m.material : [m.material];
                    m.userData.baseEmissive = mats.map(mt => mt.emissive ? mt.emissive.clone() : null);
                }
            });
            body.add(part);
            return part;
        });

        const arrival = this._freePoint(null, def.radius, def.zone);
        const waypoint = this._freePoint(null, def.radius, def.zone);
        const heading = waypoint.clone().sub(arrival).setY(0).normalize();
        if (heading.lengthSq() < 0.5) heading.set(1, 0, 0);

        const ship = {
            group, body, parts, def,
            radius: def.radius,
            size: def.radius / 380,          // 1 = Home One ; sert à doser les explosions
            heading, speed: def.speed, waypoint,
            velocity: new THREE.Vector3(),
            arrival, state: 'jump', t: 0, bank: 0
        };
        this._orient(ship);
        group.position.copy(arrival).addScaledVector(heading, -FLEET.JUMP_DISTANCE);
        body.scale.set(15, 1, 1);
        this.ctx.scene.add(group);
        this.ships.push(ship);

        // lueur au point d'entrée
        this.ctx.fx.flash(arrival.clone().addScaledVector(heading, def.radius * 0.9), Math.max(30, def.radius * 0.32), new THREE.Color(0.7, 0.85, 1), 0.6);
        return ship;
    }

    _orient(ship) {
        const f = ship.heading;
        const z = new THREE.Vector3().crossVectors(f, UP).normalize();
        const y = new THREE.Vector3().crossVectors(z, f).normalize();
        const m = new THREE.Matrix4().makeBasis(f, y, z);
        ship.group.quaternion.setFromRotationMatrix(m);
        ship.group.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(X, ship.bank));
    }

    // ---------------------------------------------------------------
    // Mise à jour
    // ---------------------------------------------------------------
    update(dt) {
        if (!this._hasTypes()) return;
        this.elapsed += dt;
        hullTime.value = this.elapsed;
        this._rayBudget = 1;

        // arrivées programmées
        for (let i = this.timers.length - 1; i >= 0; i--) {
            this.timers[i] -= dt;
            if (this.timers[i] <= 0) { this.timers.splice(i, 1); this._spawnShip(); }
        }

        for (const ship of this.ships) {
            if (ship.state === 'jump') this._updateJump(ship, dt);
            else if (ship.state === 'cruise') this._updateCruise(ship, dt);
            else if (ship.state === 'adrift') this._updateAdrift(ship, dt);
            else if (ship.state === 'leave') this._updateLeave(ship, dt);
            this._updateParts(ship, dt);
        }
        this.ships = this.ships.filter(s => s.state !== 'dead');
    }

    // départ en hyperespace (fin de la bataille)
    _updateLeave(ship, dt) {
        ship.t += dt;
        if (ship.t < 0.5) {
            // court alignement avant le saut
            ship.velocity.copy(ship.heading).multiplyScalar(ship.speed);
        } else {
            const u = (ship.t - 0.5) / 0.7;
            ship.speed += dt * 6000 * u;
            ship.body.scale.x = 1 + 14 * u * u;
            ship.velocity.copy(ship.heading).multiplyScalar(ship.speed);
            if (u >= 1) {
                this.ctx.fx.flash(ship.group.position, 90, new THREE.Color(0.75, 0.9, 1), 0.4);
                ship.state = 'dead';
                this.ctx.scene.remove(ship.group);
                return;
            }
        }
        ship.group.position.addScaledVector(ship.velocity, dt);
    }

    _updateJump(ship, dt) {
        ship.t += dt / FLEET.ARRIVAL_TIME;
        const u = Math.min(1, ship.t);
        const e = 1 - Math.pow(1 - u, 4);                      // freinage brutal en fin de saut
        ship.group.position.copy(ship.arrival).addScaledVector(ship.heading, -FLEET.JUMP_DISTANCE * (1 - e));
        ship.body.scale.x = 1 + 14 * Math.pow(1 - e, 2);        // étirement "hyperespace"
        ship.velocity.copy(ship.heading).multiplyScalar(ship.def.speed + FLEET.JUMP_DISTANCE * 4 * Math.pow(1 - u, 3) / FLEET.ARRIVAL_TIME);
        if (u >= 1) {
            ship.state = 'cruise';
            ship.body.scale.x = 1;
            const nose = ship.group.position.clone().addScaledVector(ship.heading, ship.radius * 0.9);
            this.ctx.fx.flash(nose, Math.max(25, ship.radius * 0.24), new THREE.Color(0.75, 0.9, 1), 0.45);
            if (this.ctx.onArrive) this.ctx.onArrive(ship);
        }
    }

    _updateCruise(ship, dt) {
        const pos = ship.group.position;
        if (pos.distanceTo(ship.waypoint) < 350) ship.waypoint = this._freePoint(ship, ship.radius, ship.def.zone);

        // direction voulue = vers le point + évitement des obstacles
        const desired = ship.waypoint.clone().sub(pos).normalize();
        const ahead = pos.clone().addScaledVector(ship.heading, 700);
        for (const o of this._obstacleList(ship)) {
            const R = o.radius + ship.radius + 200;
            for (const probe of [ahead, pos]) {
                const d = probe.distanceTo(o.center);
                if (d < R) desired.addScaledVector(probe.clone().sub(o.center).normalize(), 3 * (R - d) / R);
            }
        }
        desired.y *= 0.5;
        desired.normalize();

        // Direction voulue LISSÉE : près d'un obstacle, l'évitement peut basculer d'une
        // image à l'autre ; sans lissage le cap oscillait et les grands vaisseaux tremblaient.
        if (!ship.desired) ship.desired = desired.clone();
        ship.desired.lerp(desired, 1 - Math.exp(-0.8 * dt)).normalize();

        // vitesse de virage progressive (pas d'à-coups), limitée à TURN_RATE
        const before = ship.heading.clone();
        const angle = ship.heading.angleTo(ship.desired);
        const wanted = Math.min(angle * 0.6, FLEET.TURN_RATE);
        ship.turnRate = (ship.turnRate || 0) + (wanted - (ship.turnRate || 0)) * (1 - Math.exp(-1.5 * dt));
        if (angle > 1e-4) {
            const axis = new THREE.Vector3().crossVectors(ship.heading, ship.desired);
            if (axis.lengthSq() > 1e-8) ship.heading.applyAxisAngle(axis.normalize(), Math.min(angle, ship.turnRate * dt));
        }
        ship.heading.y = THREE.MathUtils.clamp(ship.heading.y, -0.2, 0.2);
        ship.heading.normalize();
        const turn = new THREE.Vector3().crossVectors(before, ship.heading).y / Math.max(dt, 1e-4);
        ship.bank += (THREE.MathUtils.clamp(-turn * 4, -0.2, 0.2) - ship.bank) * (1 - Math.exp(-dt));

        const damaged = ship.parts.some(p => p.userData.destroyed);
        ship.speed += ((damaged ? 0.6 : 1) * ship.def.speed - ship.speed) * (1 - Math.exp(-0.5 * dt));
        ship.velocity.copy(ship.heading).multiplyScalar(ship.speed);
        pos.addScaledVector(ship.velocity, dt);
        this._orient(ship);
    }

    _updateAdrift(ship, dt) {
        ship.speed += (4 - ship.speed) * (1 - Math.exp(-0.3 * dt));
        ship.velocity.copy(ship.heading).multiplyScalar(ship.speed);
        ship.group.position.addScaledVector(ship.velocity, dt);
    }

    _updateParts(ship, dt) {
        for (const part of ship.parts) {
            const ud = part.userData;

            // morceaux qui dérivent après la coupure
            if (ud.drift) {
                part.position.addScaledVector(ud.drift.v, dt);
                part.rotateOnAxis(ud.drift.axis, ud.drift.w * dt);
            }
            if (ud.destroyed) continue;

            // clignotement rouge quand la partie est touchée
            if (ud.flash > 0) {
                ud.flash = Math.max(0, ud.flash - dt);
                const k = ud.flash > 0 ? (0.5 + 0.5 * Math.sin(ud.flash * 40)) * 0.35 : 0;
                part.traverse(m => {
                    if (!m.isMesh) return;
                    const mats = Array.isArray(m.material) ? m.material : [m.material];
                    mats.forEach((mt, i) => {
                        if (!mt.emissive) return;
                        if (k > 0) mt.emissive.setRGB(k, 0, 0);
                        else if (m.userData.baseEmissive[i]) mt.emissive.copy(m.userData.baseEmissive[i]);
                    });
                });
            }

            // foyers d'incendie sur la coque
            if (ud.fires.length) {
                ud.fireTimer -= dt;
                if (ud.fireTimer <= 0) {
                    ud.fireTimer = 0.12;
                    const f = ud.fires[Math.floor(Math.random() * ud.fires.length)];
                    this.ctx.fx.fire(part.localToWorld(f.clone()), 9, ship.velocity);
                }
            }

            // faces coupées (partie voisine détruite) : traînées incandescentes
            if (ud.wounds && ud.wounds.length) {
                ud.woundTimer = (ud.woundTimer || 0) - dt;
                if (ud.woundTimer <= 0) {
                    ud.woundTimer = 0.035;
                    for (const w of ud.wounds) {
                        w.age += 0.035;
                        const strength = 0.35 + 0.65 * Math.exp(-w.age / 25);   // baisse lentement, ne s'éteint jamais
                        if (Math.random() > strength) continue;
                        const pos = part.localToWorld(w.points[Math.floor(Math.random() * w.points.length)].clone());
                        const dir = w.dir.clone().transformDirection(part.matrixWorld);
                        const vel = dir.clone().multiplyScalar(12 + Math.random() * 30)
                            .add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(10))
                            .add(ship.velocity);
                        this.ctx.fx.trail(pos, vel, 7 + Math.random() * 7 * strength);
                        if (Math.random() < 0.08 * strength) {
                            this.ctx.debris.spawn(pos, 1, { dir, speed: [10, 35], size: [0.6, 2], life: [2, 4], baseVel: ship.velocity, hot: 1 });
                        }
                    }
                }
            }
        }
    }

    // ---------------------------------------------------------------
    // Tirs
    // ---------------------------------------------------------------
    _ellipsoid(part) {
        if (part.userData.ellipsoid) return part.userData.ellipsoid;
        part.updateMatrixWorld(true);
        const inv = part.matrixWorld.clone().invert();
        const box = new THREE.Box3();
        part.traverse(m => {
            if (!m.isMesh) return;
            if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
            box.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld).applyMatrix4(inv));
        });
        const e = { center: box.getCenter(new THREE.Vector3()), radii: box.getSize(new THREE.Vector3()).multiplyScalar(0.46) };
        part.userData.ellipsoid = e;
        return e;
    }

    /**
     * Segment [p0,p1] parcouru par un tir → { ship, part, t, point } ou null.
     * 1) test rapide avec une ellipsoïde par partie ;
     * 2) à l'entrée dans l'ellipsoïde, UN lancer de rayon sur le vrai maillage
     *    donne le point d'impact exact sur la coque (mémorisé dans le tir).
     */
    hitTest(p0, p1, bolt = null) {
        const segLen = p0.distanceTo(p1);

        // impact déjà calculé : on attend que le tir atteigne la coque
        if (bolt && bolt.capPlan) {
            const plan = bolt.capPlan;
            if (plan.part.userData.destroyed || plan.ship.state === 'dead') {
                bolt.capPlan = null;
            } else if (bolt.travelled >= plan.dist) {
                const t = THREE.MathUtils.clamp(1 - (bolt.travelled - plan.dist) / Math.max(segLen, 1e-4), 0, 1);
                return { ship: plan.ship, part: plan.part, t, point: plan.part.localToWorld(plan.local.clone()) };
            } else {
                return null;
            }
        }

        const inv = new THREE.Matrix4(), a = new THREE.Vector3(), b = new THREE.Vector3(), zero = new THREE.Vector3();
        let best = null;
        for (const ship of this.ships) {
            if (ship.state === 'jump' || ship.state === 'dead') continue;
            for (const part of ship.parts) {
                if (part.userData.destroyed) continue;
                if (bolt && bolt.capIgnore && bolt.capIgnore.has(part)) continue;
                const e = this._ellipsoid(part);
                inv.copy(part.matrixWorld).invert();
                a.copy(p0).applyMatrix4(inv).sub(e.center).divide(e.radii);
                b.copy(p1).applyMatrix4(inv).sub(e.center).divide(e.radii);
                const t = segmentSphere(a, b, zero, 1);
                if (t < 0) continue;

                // lancer de rayon précis sur la coque — coûteux (dizaines de milliers de
                // triangles) : un seul par image, les autres tirs attendent l'image suivante
                if (bolt) {
                    if (this._rayBudget <= 0) continue;
                    this._rayBudget--;
                }
                const dir = p1.clone().sub(p0).normalize();
                this._ray.set(p0, dir);
                this._ray.far = 2500;
                const h = this._ray.intersectObject(part, true)[0];
                if (!h) {
                    if (bolt) (bolt.capIgnore || (bolt.capIgnore = new Set())).add(part);
                    continue;
                }
                if (h.distance <= segLen) {
                    const tt = h.distance / Math.max(segLen, 1e-4);
                    if (!best || tt < best.t) best = { ship, part, t: tt, point: h.point.clone() };
                } else if (bolt) {
                    bolt.capPlan = { ship, part, local: part.worldToLocal(h.point.clone()), dist: bolt.travelled - segLen + h.distance };
                    return null;
                }
            }
        }
        return best;
    }

    /**
     * Collision du TIE du joueur : pos + déplacement de l'image → { point, normal, velocity } ou null.
     * On ne lance un rayon (précis) que si le TIE est dans la "bulle" d'une partie.
     */
    collide(pos, move, margin = 8, dt = 1 / 60) {
        const inv = new THREE.Matrix4(), q = new THREE.Vector3();
        for (const ship of this.ships) {
            if (ship.state === 'jump' || ship.state === 'dead') continue;
            const rel = move.clone().addScaledVector(ship.velocity, -dt);
            const len = rel.length();
            if (len < 1e-4) continue;
            for (const part of ship.parts) {
                if (part.userData.destroyed) continue;
                const e = this._ellipsoid(part);
                inv.copy(part.matrixWorld).invert();
                const scale = part.matrixWorld.getMaxScaleOnAxis();
                const r = e.radii.clone().addScalar(80 / scale);
                q.copy(pos).applyMatrix4(inv).sub(e.center).divide(r);
                if (q.length() > 1) continue;

                this._ray.set(pos, rel.clone().divideScalar(len));
                this._ray.far = len + margin;
                const h = this._ray.intersectObject(part, true)[0];
                if (!h) continue;
                const normal = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : rel.clone().negate().normalize();
                if (normal.dot(rel) > 0) normal.negate();
                return { point: h.point.clone(), normal, velocity: ship.velocity.clone() };
            }
        }
        return null;
    }

    // Points répartis sur la face coupée (repère de la partie voisine)
    _addWound(part, lost) {
        const e = this._ellipsoid(part);
        const lostE = this._ellipsoid(lost);
        const lostCenter = part.worldToLocal(lost.localToWorld(lostE.center.clone()));
        const d = lostCenter.sub(e.center).normalize();                 // direction de la coupure
        const t = 1 / d.clone().divide(e.radii).length();               // bord de l'ellipsoïde dans cette direction
        const face = e.center.clone().addScaledVector(d, t * 0.93);
        const a = new THREE.Vector3().crossVectors(d, Math.abs(d.y) < 0.9 ? UP : X).normalize();
        const b = new THREE.Vector3().crossVectors(d, a).normalize();
        const spread = Math.min(e.radii.x, e.radii.y, e.radii.z) * 0.55;
        const points = [];
        for (let i = 0; i < 10; i++) {
            const ang = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
            points.push(face.clone().addScaledVector(a, Math.cos(ang) * r).addScaledVector(b, Math.sin(ang) * r));
        }
        (part.userData.wounds || (part.userData.wounds = [])).push({ points, dir: d, age: 0 });
    }

    /** Un tir touche une partie */
    hit(ship, part, point, boltDir) {
        const ud = part.userData;
        if (ud.destroyed) return;
        ud.hits++;
        ud.flash = 0.3;

        const { fx, debris } = this.ctx;
        const outward = boltDir ? boltDir.clone().negate() : new THREE.Vector3(0, 1, 0);

        const k = Math.min(1, 0.35 + ship.size * 0.65);           // petits vaisseaux : petits trous
        ud.damage.addHole(point, (13 + ud.hits * 1.5 + Math.random() * 8) * k);
        fx.explosion(point, (22 + Math.random() * 10) * k);
        debris.spawn(point, 10, { dir: outward, speed: [20, 60], size: [1.5, 5], life: [4, 8], baseVel: ship.velocity, hot: 0.5 });
        if (ud.fires.length < 6) ud.fires.push(part.worldToLocal(point.clone()));

        if (ud.hits >= ship.def.hits) this._destroyPart(ship, part);
    }

    _destroyPart(ship, part) {
        const ud = part.userData;
        ud.destroyed = true;
        const { fx, debris } = this.ctx;
        const e = this._ellipsoid(part);

        // chaîne d'explosions réparties sur la partie (suit le vaisseau)
        for (let i = 0; i < 9; i++) {
            const local = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiply(e.radii).multiplyScalar(0.8).add(e.center);
            setTimeout(() => {
                fx.explosion(part.localToWorld(local.clone()), (45 + Math.random() * 45) * Math.max(0.35, ship.size));
            }, i * 140 + Math.random() * 100);
        }
        const center = part.localToWorld(e.center.clone());
        const big = Math.max(0.3, ship.size);
        fx.explosion(center, 110 * big);
        debris.spawn(center, Math.round(20 + 50 * big), { speed: [15, 70], size: [3, 14], life: [8, 15], baseVel: ship.velocity, hot: 0.7 });
        setTimeout(() => { part.visible = false; }, 450);

        // les parties voisines gardent une "plaie" ouverte côté coupure
        const idx = ship.parts.indexOf(part);
        for (const ni of [idx - 1, idx + 1]) {
            const nb = ship.parts[ni];
            if (nb && !nb.userData.destroyed) this._addWound(nb, part);
        }
        if (this.ctx.onPartDestroyed) this.ctx.onPartDestroyed(ship, part);

        const [bow, mid, stern] = ship.parts;
        const alive = ship.parts.filter(p => !p.userData.destroyed);

        if (alive.length === 0) {
            // plus rien : explosion finale, puis un autre croiseur viendra plus tard
            ship.state = 'adrift';
            setTimeout(() => {
                if (ship.state === 'dead') return;   // déjà retiré (fin de la bataille entre-temps)
                const c = ship.group.position.clone();
                fx.explosion(c, 180 * Math.max(0.3, ship.size));
                debris.spawn(c, Math.round(25 + 55 * Math.max(0.3, ship.size)), { speed: [20, 90], size: [3, 16], life: [8, 15], baseVel: ship.velocity, hot: 0.8 });
                ship.state = 'dead';
                this.ctx.scene.remove(ship.group);
                if (this.ctx.onShipDestroyed) this.ctx.onShipDestroyed(ship);
                if (this.active) this.timers.push(rand(...FLEET.RESPAWN_DELAY));
            }, 1400);
            return;
        }

        if (part === mid || ship.state === 'adrift') {
            // coupé en deux (ou déjà coupé) : les morceaux restants partent à la dérive
            ship.state = 'adrift';
            for (const p of alive) {
                if (p.userData.drift) continue;
                const away = p === bow ? 1 : p === stern ? -1 : (Math.random() < 0.5 ? 1 : -1);
                p.userData.drift = {
                    v: new THREE.Vector3(away * rand(5, 9), rand(-2, 2), rand(-2, 2)),
                    axis: new THREE.Vector3(rand(-0.3, 0.3), rand(-0.3, 0.3), 1).normalize(),
                    w: away * rand(0.015, 0.04)
                };
            }
        }
    }

    /** Positions des croiseurs (radar) */
    positions() {
        return this.ships.filter(s => s.state !== 'jump').map(s => s.group.position);
    }

    /** Un croiseur au hasard, en état de lancer des chasseurs */
    randomActiveShip() {
        const list = this.ships.filter(s => s.state === 'cruise');
        return list.length ? list[Math.floor(Math.random() * list.length)] : null;
    }
}
