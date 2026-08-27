export type StepName =
  | 'home'
  | 'select-type'
  | 'event-action'
  | 'list-event-images'
  | 'camera'
  | 'select-theme'
  | 'finish'

export type BoothType = 'store' | 'event'

export interface CameraBehavior {
  totalTake(): number
}

export interface SelectThemeBehavior {
  listThemes(page: number): Promise<Array<Record<string, unknown>>>
  printSession(sessionId: string): Promise<string | null>
  previewLabel(): string
  copies(): number
  isTwoBySix(ratio?: string): boolean
  beforePrint(): Promise<boolean>
}

export interface BoothFlow {
  screens: StepName[]
  camera: CameraBehavior
  selectTheme: SelectThemeBehavior
}