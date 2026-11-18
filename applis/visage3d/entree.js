// Paquet three.js pour Majordome (script classique, sans modules) : window.MJ3 = { THREE, GLTFLoader }
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
window.MJ3 = { THREE: THREE, GLTFLoader: GLTFLoader };
