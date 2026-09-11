import { IconChevronRight, IconDoc, IconImage, IconMeeting, IconMic } from './icons'

interface CaptureSheetProps {
  onClose: () => void
  onTextNote: () => void
  onVoiceNote: () => void
  onMeeting: () => void
}

export default function CaptureSheet({ onClose, onTextNote, onVoiceNote, onMeeting }: CaptureSheetProps) {
  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="sheet">
        <div className="handle" />
        <h2>Capture</h2>

        <button className="opt" type="button" onClick={onTextNote}>
          <span className="opt-icon">
            <IconDoc />
          </span>
          <span className="body">
            <span className="t">Text Note</span>
            <span className="s">Write something down</span>
          </span>
          <span className="chev">
            <IconChevronRight />
          </span>
        </button>

        <button className="opt" type="button" onClick={onVoiceNote}>
          <span className="opt-icon">
            <IconMic />
          </span>
          <span className="body">
            <span className="t">Voice Note</span>
            <span className="s">Speak, get a transcript</span>
          </span>
          <span className="chev">
            <IconChevronRight />
          </span>
        </button>

        <button className="opt" type="button" onClick={onMeeting}>
          <span className="opt-icon">
            <IconMeeting />
          </span>
          <span className="body">
            <span className="t">Meeting</span>
            <span className="s">Record and get a transcript</span>
          </span>
          <span className="chev">
            <IconChevronRight />
          </span>
        </button>

        <div className="opt disabled">
          <span className="opt-icon">
            <IconImage />
          </span>
          <span className="body">
            <span className="t">Image</span>
            <span className="s">Not in this version</span>
          </span>
          <span className="later-tag">Later</span>
        </div>
      </div>
    </>
  )
}
