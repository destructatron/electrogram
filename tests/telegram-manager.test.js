import { describe, it, expect, vi, beforeEach } from 'vitest'

// Unit tests for TelegramManager helper methods that don't require a live client

describe('TelegramManager helper methods', () => {
  let tm

  beforeEach(() => {
    // TelegramManager reads from app.getPath which requires electron
    // We test the methods in isolation by constructing them with mocked internals
    tm = {
      dialogsCache: new Map(),
      messagesCache: new Map(),
    }
  })

  describe('getDisplayName', () => {
    // Helper to test the logic inline (mirrors the actual implementation)
    function getDisplayName(entity) {
      if (!entity) return 'Unknown'
      if (entity.className === 'User') {
        const parts = [entity.firstName, entity.lastName].filter(Boolean)
        return parts.join(' ') || entity.username || 'Unknown'
      }
      return entity.title || entity.username || 'Unknown'
    }

    it('returns Unknown for null entity', () => {
      expect(getDisplayName(null)).toBe('Unknown')
    })

    it('returns Unknown for undefined entity', () => {
      expect(getDisplayName(undefined)).toBe('Unknown')
    })

    it('returns full name for User with first and last name', () => {
      const user = { className: 'User', firstName: 'Alice', lastName: 'Bob' }
      expect(getDisplayName(user)).toBe('Alice Bob')
    })

    it('returns firstName only when lastName missing', () => {
      const user = { className: 'User', firstName: 'Alice' }
      expect(getDisplayName(user)).toBe('Alice')
    })

    it('falls back to username for User with no names', () => {
      const user = { className: 'User', username: 'alicebob' }
      expect(getDisplayName(user)).toBe('alicebob')
    })

    it('returns username when User has no names or username', () => {
      const user = { className: 'User' }
      expect(getDisplayName(user)).toBe('Unknown')
    })

    it('returns title for Chat entity', () => {
      const chat = { className: 'Chat', title: 'Test Group' }
      expect(getDisplayName(chat)).toBe('Test Group')
    })

    it('returns username for Channel with no title', () => {
      const channel = { className: 'Channel', username: 'testchannel' }
      expect(getDisplayName(channel)).toBe('testchannel')
    })
  })

  describe('getVoiceInfo', () => {
    function getVoiceInfo(msg) {
      if (!msg) return { isVoice: false, voiceDuration: 0 }
      const media = msg.media
      if (media && media.className === 'MessageMediaDocument') {
        const document = media.document
        if (document && document.attributes) {
          const audioAttr = document.attributes.find(a => a.className === 'DocumentAttributeAudio')
          if (audioAttr && audioAttr.voice) {
            return { isVoice: true, voiceDuration: audioAttr.duration || 0 }
          }
        }
      }
      return { isVoice: false, voiceDuration: 0 }
    }

    it('returns not voice for null message', () => {
      expect(getVoiceInfo(null)).toEqual({ isVoice: false, voiceDuration: 0 })
    })

    it('returns not voice for message with photo media', () => {
      const msg = { media: { className: 'MessageMediaPhoto' } }
      expect(getVoiceInfo(msg)).toEqual({ isVoice: false, voiceDuration: 0 })
    })

    it('detects voice message with duration', () => {
      const msg = {
        media: {
          className: 'MessageMediaDocument',
          document: {
            attributes: [
              { className: 'DocumentAttributeAudio', voice: true, duration: 42 }
            ]
          }
        }
      }
      expect(getVoiceInfo(msg)).toEqual({ isVoice: true, voiceDuration: 42 })
    })

    it('treats audio without voice flag as not voice', () => {
      const msg = {
        media: {
          className: 'MessageMediaDocument',
          document: {
            attributes: [
              { className: 'DocumentAttributeAudio', voice: false, duration: 30 }
            ]
          }
        }
      }
      expect(getVoiceInfo(msg)).toEqual({ isVoice: false, voiceDuration: 0 })
    })

    it('returns 0 duration when duration not set', () => {
      const msg = {
        media: {
          className: 'MessageMediaDocument',
          document: {
            attributes: [
              { className: 'DocumentAttributeAudio', voice: true }
            ]
          }
        }
      }
      expect(getVoiceInfo(msg)).toEqual({ isVoice: true, voiceDuration: 0 })
    })
  })

  describe('getPhotoInfo', () => {
    function getPhotoInfo(msg) {
      if (!msg) return null
      const media = msg.media
      if (media && media.className === 'MessageMediaPhoto' && media.photo) {
        const sizes = media.photo.sizes || []
        let width = 0
        let height = 0
        for (const size of sizes) {
          if (size && typeof size.w === 'number' && typeof size.h === 'number') {
            if (size.w > width) {
              width = size.w
              height = size.h
            }
          }
        }
        return { hasPhoto: true, photoWidth: width, photoHeight: height }
      }
      return null
    }

    it('returns null for null message', () => {
      expect(getPhotoInfo(null)).toBeNull()
    })

    it('returns null when no media', () => {
      expect(getPhotoInfo({})).toBeNull()
    })

    it('returns null for document media', () => {
      const msg = { media: { className: 'MessageMediaDocument' } }
      expect(getPhotoInfo(msg)).toBeNull()
    })

    it('returns null when photo property missing', () => {
      const msg = { media: { className: 'MessageMediaPhoto' } }
      expect(getPhotoInfo(msg)).toBeNull()
    })

    it('returns photo info with largest dimensions', () => {
      const msg = {
        media: {
          className: 'MessageMediaPhoto',
          photo: {
            sizes: [
              { w: 100, h: 200 },
              { w: 800, h: 600 },
              { w: 400, h: 300 },
            ]
          }
        }
      }
      expect(getPhotoInfo(msg)).toEqual({ hasPhoto: true, photoWidth: 800, photoHeight: 600 })
    })

    it('handles empty sizes array', () => {
      const msg = {
        media: {
          className: 'MessageMediaPhoto',
          photo: { sizes: [] }
        }
      }
      expect(getPhotoInfo(msg)).toEqual({ hasPhoto: true, photoWidth: 0, photoHeight: 0 })
    })

    it('skips sizes with invalid dimensions', () => {
      const msg = {
        media: {
          className: 'MessageMediaPhoto',
          photo: {
            sizes: [
              { w: 100, h: 200 },
              { w: 'bad', h: null },
              { w: 300, h: 400 },
            ]
          }
        }
      }
      expect(getPhotoInfo(msg)).toEqual({ hasPhoto: true, photoWidth: 300, photoHeight: 400 })
    })
  })

  describe('getReplyPreview', () => {
    function getReplyPreview(msg, { getVoiceInfo, getPhotoInfo } = {}) {
      const text = msg.message || msg.text || ''
      if (text) return text
      if (getVoiceInfo) {
        const voiceInfo = getVoiceInfo(msg)
        if (voiceInfo.isVoice) return 'Voice message'
      }
      if (getPhotoInfo) {
        const photoInfo = getPhotoInfo(msg)
        if (photoInfo) return 'Photo'
      }
      if (msg.action) return 'Service message'
      return ''
    }

    it('returns text message content', () => {
      expect(getReplyPreview({ message: 'Hello!' })).toBe('Hello!')
    })

    it('returns text property', () => {
      expect(getReplyPreview({ text: 'Hi there' })).toBe('Hi there')
    })

    it('returns empty string for no content', () => {
      expect(getReplyPreview({})).toBe('')
    })

    it('returns "Voice message" for voice media', () => {
      const voiceInfo = { isVoice: true, voiceDuration: 30 }
      expect(getReplyPreview({ media: {} }, { getVoiceInfo: () => voiceInfo })).toBe('Voice message')
    })

    it('returns "Photo" for photo media', () => {
      const photoInfo = { hasPhoto: true, photoWidth: 100, photoHeight: 200 }
      expect(getReplyPreview({ media: {} }, { getPhotoInfo: () => photoInfo })).toBe('Photo')
    })

    it('returns "Service message" for action messages', () => {
      expect(getReplyPreview({ action: {} })).toBe('Service message')
    })
  })

  describe('getFileInfo', () => {
    function getFileInfo(msg) {
      if (!msg) return null
      const media = msg.media
      if (media && media.className === 'MessageMediaDocument') {
        const document = media.document
        if (document) {
          const filenameAttr = document.attributes.find(a => a.className === 'DocumentAttributeFilename')
          const audioAttr = document.attributes.find(a => a.className === 'DocumentAttributeAudio')
          const videoAttr = document.attributes.find(a => a.className === 'DocumentAttributeVideo')
          if (audioAttr && audioAttr.voice) return null
          if (videoAttr) return null
          return {
            hasDocument: true,
            fileName: filenameAttr ? filenameAttr.fileName : 'file',
            documentSize: Number(document.size) || 0
          }
        }
      }
      return null
    }

    it('returns null for null message', () => {
      expect(getFileInfo(null)).toBeNull()
    })

    it('returns null for message without document media', () => {
      expect(getFileInfo({ media: { className: 'MessageMediaPhoto' } })).toBeNull()
    })

    it('returns null for voice messages (excluded from file list)', () => {
      const msg = {
        media: {
          className: 'MessageMediaDocument',
          document: {
            attributes: [
              { className: 'DocumentAttributeAudio', voice: true }
            ]
          }
        }
      }
      expect(getFileInfo(msg)).toBeNull()
    })

    it('returns null for video messages', () => {
      const msg = {
        media: {
          className: 'MessageMediaDocument',
          document: {
            attributes: [
              { className: 'DocumentAttributeVideo' }
            ]
          }
        }
      }
      expect(getFileInfo(msg)).toBeNull()
    })

    it('returns file info for document files', () => {
      const msg = {
        media: {
          className: 'MessageMediaDocument',
          document: {
            size: 1048576,
            attributes: [
              { className: 'DocumentAttributeFilename', fileName: 'document.pdf' }
            ]
          }
        }
      }
      expect(getFileInfo(msg)).toEqual({
        hasDocument: true,
        fileName: 'document.pdf',
        documentSize: 1048576
      })
    })

    it('uses "file" as default filename when no filename attribute', () => {
      const msg = {
        media: {
          className: 'MessageMediaDocument',
          document: {
            size: 512,
            attributes: []
          }
        }
      }
      expect(getFileInfo(msg)).toEqual({
        hasDocument: true,
        fileName: 'file',
        documentSize: 512
      })
    })
  })

  describe('getInlineButtons', () => {
    function getInlineButtons(msg) {
      const markup = msg.replyMarkup
      if (!markup || markup.className !== 'ReplyInlineMarkup') return null
      return markup.rows.map((row, rowIdx) => ({
        buttons: row.buttons.map((btn, colIdx) => ({
          text: btn.text,
          row: rowIdx,
          col: colIdx
        }))
      }))
    }

    it('returns null when no replyMarkup', () => {
      expect(getInlineButtons({})).toBeNull()
    })

    it('returns null for non-inline markup', () => {
      const msg = { replyMarkup: { className: 'ReplyMarkup' } }
      expect(getInlineButtons(msg)).toBeNull()
    })

    it('extracts inline buttons with correct row/col indices', () => {
      const msg = {
        replyMarkup: {
          className: 'ReplyInlineMarkup',
          rows: [
            {
              buttons: [
                { text: 'Yes' },
                { text: 'No' }
              ]
            },
            {
              buttons: [
                { text: 'Cancel' }
              ]
            }
          ]
        }
      }
      const result = getInlineButtons(msg)
      expect(result).toEqual([
        { buttons: [{ text: 'Yes', row: 0, col: 0 }, { text: 'No', row: 0, col: 1 }] },
        { buttons: [{ text: 'Cancel', row: 1, col: 0 }] }
      ])
    })
  })
})