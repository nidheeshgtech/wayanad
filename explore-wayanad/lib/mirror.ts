import { PerspectiveCamera } from "three";

/** The rear-view mirror shown while you reverse: PlayerCar puts the camera at the back of the car, facing back, and
 * eases `amount` (0 = hidden, 1 = shown); components/drive/RearMirror draws it into the frame the HUD leaves for it.
 * Far as the main camera's, so the sky dome (350) is inside it. */
export const mirror = { camera: new PerspectiveCamera(46, 3, 0.02, 400), amount: 0 };
