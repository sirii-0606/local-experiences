import * as THREE from "three";
import type { MonumentId } from "../types";
import { buildHawaMahal } from "./HawaMahalGenerator";
import { buildAmerFort } from "./AmerFortGenerator";
import { buildStepwell } from "./StepwellGenerator";
import { buildJantarMantar } from "./JantarMantarGenerator";
import { buildAlbertHall } from "./AlbertHallGenerator";
import { buildNahargarh } from "./NahargarhGenerator";
import { buildGaltaJi } from "./GaltaJiGenerator";

/**
 * Procedural Monument Factory — returns fully articulated, high-poly
 * Three.js scenes for each major landmark in Jaipur.
 */
export function createMonumentScene(monumentId: MonumentId): THREE.Group {
  switch (monumentId) {
    case "hawa-mahal":
      return buildHawaMahal();
    case "amer-fort":
      return buildAmerFort();
    case "panna-meena-stepwell":
      return buildStepwell();
    case "jantar-mantar":
      return buildJantarMantar();
    case "albert-hall":
      return buildAlbertHall();
    case "nahargarh-fort":
      return buildNahargarh();
    case "galta-ji":
      return buildGaltaJi();
    default:
      return buildHawaMahal();
  }
}
