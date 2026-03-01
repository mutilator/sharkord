// The electron renderer reuses the web client's main application layout.
// All routing, state management, and UI components are shared between
// web and desktop versions. Differences are handled via platform detection
// and the electron-store auth wrapper.
//
// Note: This file is kept for reference but not used; main.tsx directly
// mounts the provider stack and routing component.

export default function App() {
  return null;
}

