import './style.css'
import { App } from './app'

async function boot(): Promise<void> {
  // Floating texts use the display font; give it a moment to load.
  await Promise.race([document.fonts.load('20px "Lilita One"'), new Promise((r) => setTimeout(r, 1500))])
  const app = new App()
  // Handle for poking at the shift from the console while developing.
  if (import.meta.env.DEV) Object.assign(window, { __app: app })
}

void boot()
