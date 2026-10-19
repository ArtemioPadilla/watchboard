import { describe, it, expect } from 'vitest';
import { ownServiceWorkerScope, isForeignServiceWorker } from './sw-scope';

describe('ownServiceWorkerScope', () => {
  it('is the origin plus the base path, always trailing-slashed', () => {
    expect(ownServiceWorkerScope('/', 'https://watchboard.dev')).toBe('https://watchboard.dev/');
    expect(ownServiceWorkerScope('/watchboard/', 'https://user.github.io')).toBe('https://user.github.io/watchboard/');
    expect(ownServiceWorkerScope('/watchboard', 'https://user.github.io')).toBe('https://user.github.io/watchboard/');
  });

  it('follows whatever host the deployment is actually served from', () => {
    expect(ownServiceWorkerScope('/', 'http://localhost:4321')).toBe('http://localhost:4321/');
    expect(ownServiceWorkerScope('/', 'http://nas.local:8080')).toBe('http://nas.local:8080/');
  });
});

describe('isForeignServiceWorker', () => {
  // The bug: the test was `!scope.includes('watchboard.dev')`, so every
  // registration on any other host looked foreign and the page unregistered
  // its own worker on each load. This repo ships a Docker image, a
  // docker-compose with CasaOS metadata and a self-hosting guide, so "any
  // other host" is a supported way to run it — and localhost is how it is
  // developed.
  it('keeps our own worker, wherever the site is served from', () => {
    for (const origin of ['https://watchboard.dev', 'http://localhost:4321', 'http://nas.local:8080']) {
      const own = ownServiceWorkerScope('/', origin);
      expect(isForeignServiceWorker(own, own)).toBe(false);
    }
  });

  it('unregisters one left at a scope the site no longer serves', () => {
    const own = ownServiceWorkerScope('/', 'https://watchboard.dev');
    expect(isForeignServiceWorker('https://watchboard.dev/watchboard/', own)).toBe(true);
  });

  it('keeps the base-path worker when that is where we live', () => {
    const own = ownServiceWorkerScope('/watchboard/', 'https://user.github.io');
    expect(isForeignServiceWorker('https://user.github.io/watchboard/', own)).toBe(false);
    expect(isForeignServiceWorker('https://user.github.io/', own)).toBe(true);
  });

  it('leaves a registration with no scope alone rather than guessing', () => {
    expect(isForeignServiceWorker(undefined, 'https://watchboard.dev/')).toBe(false);
    expect(isForeignServiceWorker('', 'https://watchboard.dev/')).toBe(false);
  });
});
