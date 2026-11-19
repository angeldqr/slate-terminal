import type { SlateApi } from './index'

declare global {
  interface Window {
    slate: SlateApi
  }
}
