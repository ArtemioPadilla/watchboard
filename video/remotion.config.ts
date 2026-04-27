// Remotion entrypoint config — points the Studio + renderer at Root.tsx
// (which already calls registerRoot at the bottom).
import { Config } from '@remotion/cli/config';

Config.setEntryPoint('./src/Root.tsx');
