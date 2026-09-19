import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AUDIO_MIME_CANDIDATES,
  classifyMicError,
  insecureContextFailure,
  isNativeHost,
  permissionStepsFor,
  pickAudioMimeType,
  unsupportedFailure,
  type MicHost,
} from './micGuidance.ts'

const ALL_HOSTS: MicHost[] = ['android-app', 'ios-app', 'chrome', 'edge', 'firefox', 'safari', 'other']

test('isNativeHost is true only for the app shells', () => {
  assert.equal(isNativeHost('android-app'), true)
  assert.equal(isNativeHost('ios-app'), true)
  assert.equal(isNativeHost('chrome'), false)
  assert.equal(isNativeHost('safari'), false)
  assert.equal(isNativeHost('other'), false)
})

test('every host gets non-empty, actionable permission steps', () => {
  for (const host of ALL_HOSTS) {
    const steps = permissionStepsFor(host)
    assert.ok(steps.length > 0, `${host} produced no steps`)
    for (const step of steps) {
      assert.ok(step.trim().length > 0, `${host} produced a blank step`)
    }
  }
})

test('native hosts are sent to OS settings, browsers to the address bar', () => {
  // The whole point of the split: telling an Android user to "check your
  // browser's site settings" is useless, and vice versa.
  const android = permissionStepsFor('android-app').join(' ')
  assert.match(android, /Settings/)
  assert.match(android, /Permissions/)
  assert.doesNotMatch(android, /address bar/)

  const chrome = permissionStepsFor('chrome').join(' ')
  assert.match(chrome, /address bar/)
  // Note the word boundary: "microphone" contains "phone", so a bare
  // /phone/ here matches the legitimate mention of the microphone itself.
  assert.doesNotMatch(chrome, /\byour phone\b/)
  assert.doesNotMatch(chrome, /Settings app/)
})

test('a denied permission is classified as denied, with settings steps', () => {
  for (const name of ['NotAllowedError', 'PermissionDeniedError', 'SecurityError']) {
    const failure = classifyMicError(name, 'chrome')
    assert.equal(failure.reason, 'denied', `${name} should classify as denied`)
    assert.equal(failure.canRetry, true)
    assert.deepEqual(failure.steps, permissionStepsFor('chrome'))
  }
})

test('denied steps follow the host, not the error', () => {
  const onAndroid = classifyMicError('NotAllowedError', 'android-app')
  const onChrome = classifyMicError('NotAllowedError', 'chrome')
  assert.notDeepEqual(onAndroid.steps, onChrome.steps)
})

test('missing hardware is not reported as a permission problem', () => {
  // This is the bug this module exists to fix: the old code showed
  // "Microphone access was denied" for every failure, including this one.
  for (const name of ['NotFoundError', 'DevicesNotFoundError', 'OverconstrainedError']) {
    const failure = classifyMicError(name, 'chrome')
    assert.equal(failure.reason, 'no-device', `${name} should classify as no-device`)
    assert.doesNotMatch(failure.title, /permission/i)
    assert.doesNotMatch(failure.steps.join(' '), /site settings/i)
  }
})

test('a busy microphone is not reported as a permission problem', () => {
  for (const name of ['NotReadableError', 'TrackStartError', 'AbortError']) {
    const failure = classifyMicError(name, 'chrome')
    assert.equal(failure.reason, 'in-use', `${name} should classify as in-use`)
    assert.doesNotMatch(failure.title, /permission/i)
  }
})

test('an unrecognized error falls through to unknown rather than guessing', () => {
  for (const name of ['', 'WeirdVendorError', 'TypeError']) {
    const failure = classifyMicError(name, 'chrome')
    assert.equal(failure.reason, 'unknown')
    assert.equal(failure.canRetry, true)
  }
})

test('every classified failure is presentable', () => {
  const names = ['NotAllowedError', 'NotFoundError', 'NotReadableError', 'MysteryError']
  for (const host of ALL_HOSTS) {
    for (const name of names) {
      const failure = classifyMicError(name, host)
      assert.ok(failure.title.trim().length > 0, `${host}/${name} had a blank title`)
      assert.ok(failure.steps.length > 0, `${host}/${name} had no steps`)
      assert.equal(typeof failure.canRetry, 'boolean')
    }
  }
})

test('unsupported and insecure-context failures do not offer a pointless retry', () => {
  // Retrying cannot fix either of these, so the UI must not show the button.
  assert.equal(unsupportedFailure('chrome').canRetry, false)
  assert.equal(unsupportedFailure('android-app').canRetry, false)
  assert.equal(insecureContextFailure().canRetry, false)
})

test('unsupported advice differs between app and browser', () => {
  assert.match(unsupportedFailure('android-app').steps.join(' '), /Update the app/)
  assert.match(unsupportedFailure('chrome').steps.join(' '), /Chrome, Edge, or Safari/)
})

test('insecure-context failure names the actual fix', () => {
  assert.match(insecureContextFailure().steps.join(' '), /https/)
})

test('pickAudioMimeType returns the first supported candidate, in order', () => {
  assert.equal(
    pickAudioMimeType(() => true),
    'audio/webm;codecs=opus',
  )
  // Safari-ish: only mp4 available.
  assert.equal(
    pickAudioMimeType((t) => t === 'audio/mp4'),
    'audio/mp4',
  )
  // Ordering must be respected when several are supported.
  assert.equal(
    pickAudioMimeType((t) => t === 'audio/mp4' || t === 'audio/webm'),
    'audio/webm',
  )
})

test('pickAudioMimeType returns undefined when nothing is supported', () => {
  // undefined means "let MediaRecorder choose" — not a crash, and not a
  // bogus mimeType that MediaRecorder would silently ignore anyway.
  assert.equal(
    pickAudioMimeType(() => false),
    undefined,
  )
})

test('every mime candidate is a plausible audio container', () => {
  assert.ok(AUDIO_MIME_CANDIDATES.length > 0)
  for (const type of AUDIO_MIME_CANDIDATES) {
    assert.match(type, /^audio\//)
  }
})
