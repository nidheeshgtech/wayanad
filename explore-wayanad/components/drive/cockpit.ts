import { BoxGeometry, CanvasTexture, PointLight, CylinderGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace, TorusGeometry, Vector3 } from "three";

/**
 * The driver's cab of the state bus, for drive mode's inside view: dashboard, a big bus steering wheel that turns
 * with yours, the speedometer, windscreen pillars and the roof edge, and wipers for the rain. Built in the bus's own
 * frame (units of 10 m; +z forward, +x the bus's left, y up from the road), sized for the KSRTC model in traffic
 * (0.94 long, 0.225 wide, 0.262 tall). Right-hand drive: the driver sits on the right, at x = SEAT.x.
 */
export const SEAT = { x: -0.058, y: 0.208, z: 0.325 }; // the driver's eye
const FRONT = 0.425;   // the windscreen's foot, z
const HALF = 0.108;    // the cab's inside half width

export function buildCockpit() {
  const g = new Group(); g.name = "cockpit";
  const plastic = new MeshStandardMaterial({ color: 0x2c3033, roughness: 0.8 });
  const trim = new MeshStandardMaterial({ color: 0x5a5f62, roughness: 0.6 });
  const grip = new MeshStandardMaterial({ color: 0x17191a, roughness: 0.6 });
  const paint = new MeshStandardMaterial({ color: 0xb3201e, roughness: 0.5 }); // the bus's red, round the screen
  const cream = new MeshStandardMaterial({ color: 0xe8dcae, roughness: 0.6, side: DoubleSide });
  const add = (m: Mesh, x: number, y: number, z: number) => { m.position.set(x, y, z); g.add(m); return m; };

  // dashboard: a long dark shelf under the windscreen, a raised binnacle in front of the driver
  add(new Mesh(new BoxGeometry(HALF * 2, 0.014, 0.06), plastic), 0, 0.15, FRONT - 0.03);
  add(new Mesh(new BoxGeometry(0.06, 0.03, 0.03), plastic), SEAT.x, 0.162, FRONT - 0.035).rotation.x = -0.35;
  // the cab's front wall below the dash, the floor edge of the screen
  add(new Mesh(new BoxGeometry(HALF * 2, 0.012, 0.012), trim), 0, 0.168, FRONT - 0.002);
  // windscreen pillars, the bar between the two panes, the header and roof edge above
  for (const x of [HALF, -HALF]) add(new Mesh(new BoxGeometry(0.014, 0.11, 0.014), paint), x, 0.218, FRONT - 0.004);
  add(new Mesh(new BoxGeometry(0.0035, 0.1, 0.0035), grip), 0, 0.215, FRONT);
  add(new Mesh(new BoxGeometry(HALF * 2 + 0.014, 0.028, 0.016), paint), 0, 0.276, FRONT - 0.006);
  add(new Mesh(new PlaneGeometry(HALF * 2, 0.32), cream), 0, 0.29, FRONT - 0.16).rotation.x = Math.PI / 2; // ceiling
  // side window frames and the cab's side walls up to the sill
  for (const s of [1, -1]) {
    add(new Mesh(new BoxGeometry(0.008, 0.008, 0.3), paint), s * (HALF + 0.004), 0.17, FRONT - 0.15);
    add(new Mesh(new BoxGeometry(0.008, 0.09, 0.012), trim), s * (HALF + 0.004), 0.215, FRONT - 0.17);
  }

  // speedometer: a dial on the binnacle and a needle that turns (0–100 km/h over 240°)
  const dial = document.createElement("canvas"); dial.width = dial.height = 128;
  const c = dial.getContext("2d")!;
  c.fillStyle = "#0d0f10"; c.beginPath(); c.arc(64, 64, 62, 0, Math.PI * 2); c.fill();
  c.strokeStyle = "#e8e4d6"; c.fillStyle = "#e8e4d6"; c.font = "bold 13px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
  for (let k = 0; k <= 10; k++) {
    const a = (-210 + k * 24) * (Math.PI / 180), r0 = k % 2 ? 50 : 45;
    c.lineWidth = k % 2 ? 1.5 : 3; c.beginPath(); c.moveTo(64 + Math.cos(a) * r0, 64 + Math.sin(a) * r0); c.lineTo(64 + Math.cos(a) * 58, 64 + Math.sin(a) * 58); c.stroke();
    if (k % 2 === 0) c.fillText(String(k * 10), 64 + Math.cos(a) * 34, 64 + Math.sin(a) * 34);
  }
  c.font = "9px sans-serif"; c.fillText("km/h", 64, 92);
  const tex = new CanvasTexture(dial); tex.colorSpace = SRGBColorSpace;
  const gauge = add(new Mesh(new PlaneGeometry(0.013, 0.013), new MeshBasicMaterial({ map: tex })), SEAT.x - 0.006, 0.1785, FRONT - 0.045);
  gauge.rotation.set(-0.35, Math.PI, 0); // faces the driver
  const needle = new Mesh(new BoxGeometry(0.0005, 0.0055, 0.0003), new MeshBasicMaterial({ color: 0xff5a2a }));
  needle.geometry.translate(0, 0.00275, 0);
  const pivot = new Group(); pivot.position.copy(gauge.position).add(new Vector3(0, 0.0002, -0.0006)); pivot.rotation.copy(gauge.rotation); pivot.add(needle); g.add(pivot);

  const small = add(new Mesh(new PlaneGeometry(0.008, 0.008), new MeshBasicMaterial({ map: tex, color: 0x9a9a9a })), SEAT.x + 0.011, 0.1775, FRONT - 0.045);
  small.rotation.copy(gauge.rotation);
  // a soft light in the cab, so the wheel and dash read under a dark sky
  const lamp = new PointLight(0xfff1dc, 0.35, 0.6, 1.5); lamp.position.set(SEAT.x, 0.27, SEAT.z + 0.02); g.add(lamp);

  // the steering wheel: big and laid back like a bus's, on its column; `wheel` turns about its own axis
  const column = new Group(); column.position.set(SEAT.x, 0.168, SEAT.z + 0.05); column.rotation.x = -0.62; g.add(column);
  const shaft = new Mesh(new CylinderGeometry(0.0025, 0.003, 0.05, 10), plastic); shaft.position.y = -0.022; column.add(shaft);
  const wheel = new Group(); column.add(wheel);
  wheel.add(new Mesh(new TorusGeometry(0.022, 0.0024, 12, 48), grip));
  for (const a of [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3]) {
    const spoke = new Mesh(new BoxGeometry(0.0028, 0.022, 0.0014), trim); spoke.geometry.translate(0, 0.011, 0); spoke.rotation.z = a; wheel.add(spoke);
  }
  wheel.add(new Mesh(new CylinderGeometry(0.006, 0.006, 0.003, 16), trim).rotateX(Math.PI / 2)); // the horn boss
  wheel.rotation.x = Math.PI / 2; // lie the ring in the column's plane

  // wipers: pivots at the foot of each pane, sweeping when it rains
  const wipers = [0.055, -0.055].map((x) => {
    const p = new Group(); p.position.set(x - 0.04, 0.17, FRONT + 0.004); g.add(p);
    const arm = new Mesh(new BoxGeometry(0.0018, 0.085, 0.0015), plastic); arm.geometry.translate(0, 0.0425, 0); p.add(arm);
    return p;
  });

  return {
    group: g,
    /** steer −1…1 (left +), speed in km/h, wipe phase (radians; the caller advances it while raining) */
    update(steer: number, kmh: number, wipe: number) {
      wheel.rotation.y = 0; wheel.rotation.z = steer * 2.4; // a bus wheel turns a long way
      needle.rotation.z = -((-210 + Math.min(100, Math.max(0, kmh)) * 2.4 + 90) * Math.PI) / 180;
      const sweep = (Math.sin(wipe) * 0.5 + 0.5) * 1.6;
      wipers.forEach((p) => { p.rotation.z = 0.35 - sweep; });
    },
  };
}
