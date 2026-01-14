# Data Model — Firestore Schemas

## users/{uid}
- profile
  - firstName, lastName, email, major, startingYear, handle, bio (existing)
  - minor: string | null
  - profilePhotoUrl: string | null
  - useAvatar: boolean
  - interests: string[] (≤10)
  - qnaResponses: {questionId, question, answer, answeredAt}[] (1–5)
  - socialLinks?: {type: 'instagram'|'facebook'|'linkedin'|'github'|'x'|'custom', url: string}[]
- avatarConfig: existing
- universityInfo: existing
- socialInfo
  - friendsCount: number (existing)
  - friendIds?: string[] (denormalized for mutual friends preview)
- scheduleData: existing (7×N grid + slotInfo + timeSlots + metadata)
- courses?:
  - Array<{
      courseName: string,
      courseCode?: string,
      section: number,
      dayPattern: 'ST'|'MW'|'AR'|'TR'|'MWF'|'S'|'M'|'T'|'W'|'A'|'F'|'R',
      timeStart: 'HH:mm',
      timeEnd: 'HH:mm',
      timeSlot: 'HHmm-HHmm',
      classroom: string
    }>
- systemInfo: profileSetupComplete (must be true for Groups), status, createdAt, lastUpdated

## classSpaces/{spaceId}
- Keys (normalized): university, courseName, courseCode?, section, dayPattern, timeSlot, timeStart, timeEnd, classroom
- memberIds: string[] (for array-contains lookups)
- memberCount: number
- memberInfo: { [uid]: { handle, firstName, lastName, major, avatarConfig, profilePhotoUrl } }
- active: boolean
- createdAt: timestamp
- lastActivity: timestamp
- lastMessagePreview: { content: string, senderId: string, createdAt: timestamp }
- visibility: 'university'

## classSpaces/{spaceId}/messages/{messageId}
- senderId: string
- senderInfo: { handle, firstName, avatarConfig }
- content: string
- createdAt: timestamp
- edited: boolean
- editedAt: timestamp | null
- deleted: boolean

## moderationReports/{autoId}
- reportedUserId?: string
- reportedMessageId?: string
- reporterId: string
- reason: 'harassment'|'spam'|'impersonation'|'inappropriate_profile'|'other'
- description: string (≥50 chars)
- createdAt: timestamp

