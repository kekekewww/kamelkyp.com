/**
 * Shared Studio primitives (admin-architecture §4.13). Parallel packages build
 * their screens from these; styles live in `app/styles/studio/base.css`.
 */
export {
  type Flag,
  FlagBadge,
  SaveStateIndicator,
  StatusBadge,
} from "./badges";
export { ConfirmDialog, TypeToConfirm } from "./confirm-dialog";
export {
  EditorLayout,
  EditorSection,
  type EditorSectionInfo,
} from "./editor-layout";
export {
  backupKey,
  initialSaveState,
  type SaveState,
  saveStateLabel,
  saveStateReducer,
  serializeForm,
} from "./editor-state";
export {
  Checkbox,
  DateInput,
  Field,
  NumberInput,
  SegmentedControl,
  Select,
  Switch,
  TextArea,
  TextInput,
  useFieldIds,
} from "./fields";
export {
  EmptyState,
  EntryRow,
  FilterBar,
  OrderControls,
  RowList,
  STATUS_FILTERS,
  type StatusFilter,
  useKeyboardReorder,
} from "./list";
export { ListEditor, TagInput } from "./list-editor";
export { LocalizedTextArea, LocalizedTextField } from "./localized-field";
export {
  MediaField,
  MediaListField,
  MediaPicker,
  MediaThumb,
} from "./media-field";
export {
  PREVIEW_FRAME_NAME,
  PreviewPane,
  previewSrc,
} from "./preview-pane";
export {
  focusIssueField,
  PublicationPanel,
  ValidationChecklist,
} from "./publication-panel";
export {
  keyboardReorderReducer,
  moveItem,
  reorderAnnouncement,
} from "./reorder";
export { ShortcutHelp, STUDIO_SHORTCUTS } from "./shortcut-help";
export { SlugField } from "./slug-field";
export { CsrfField, IntentButton, StudioForm } from "./studio-form";
export {
  StudioSessionProvider,
  type StudioSessionValue,
  useStudioSession,
} from "./studio-session";
export { TermMultiSelect, TermSelect } from "./term-select";
export { type ToastInput, ToastProvider, useToast } from "./toast";
export { useEditorForm } from "./use-editor-form";
