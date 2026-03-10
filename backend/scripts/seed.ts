// ─────────────────────────────────────────────────────────
//  Database seed — demo data for development
// ─────────────────────────────────────────────────────────
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import dayjs from 'dayjs'

const db = new PrismaClient()

async function main() {
  console.log('🌱 Seeding Bloei database…')

  // ── Demo org + owner ──────────────────────────────────
  const pw = await bcrypt.hash('bloei_demo_2025', 12)

  const user = await db.user.upsert({
    where: { email: 'demo@bloei.nl' },
    update: {},
    create: {
      email: 'demo@bloei.nl',
      passwordHash: pw,
      name: 'Demo Gebruiker',
      locale: 'NL',
      onboardingDone: true,
      ownedOrg: {
        create: {
          name:       'Bloei Demo BV',
          slug:       'bloei-demo-bv',
          sector:     'IT',
          plan:       'TEAM',
          trialEndsAt: dayjs().add(30, 'day').toDate(),
        },
      },
    },
    include: { ownedOrg: true },
  })

  const orgId = user.ownedOrg!.id

  // Fix team member FK
  await db.teamMember.upsert({
    where: { userId_orgId: { userId: user.id, orgId } },
    update: {},
    create: { userId: user.id, orgId, role: 'OWNER', advocacyScore: 120, postsShared: 12 },
  })

  // ── Extra team members ────────────────────────────────
  const teammates = [
    { email: 'sophie@bloei.nl',  name: 'Sophie Bakker', score: 90,  shared: 9  },
    { email: 'thomas@bloei.nl',  name: 'Thomas Jansen', score: 60,  shared: 6  },
    { email: 'emma@bloei.nl',    name: 'Emma de Vries', score: 40,  shared: 4  },
  ]
  for (const t of teammates) {
    const tm = await db.user.upsert({
      where: { email: t.email },
      update: {},
      create: { email: t.email, passwordHash: pw, name: t.name, locale: 'NL' },
    })
    await db.teamMember.upsert({
      where: { userId_orgId: { userId: tm.id, orgId } },
      update: {},
      create: { userId: tm.id, orgId, role: 'EDITOR', advocacyScore: t.score, postsShared: t.shared },
    })
  }

  // ── Platform connection (mock LinkedIn) ───────────────
  await db.platformConnection.upsert({
    where: { orgId_platform_platformUserId: { orgId, platform: 'LINKEDIN', platformUserId: 'li_demo_123' } },
    update: {},
    create: {
      orgId,
      platform:        'LINKEDIN',
      platformUserId:  'li_demo_123',
      platformName:    'Bloei Demo BV',
      platformUsername:'@bloeidemo',
      accessTokenEnc:  'demo_encrypted_token',
      followerCount:   1240,
      isActive:        true,
      lastSyncAt:      new Date(),
    },
  })

  // ── Sample posts ──────────────────────────────────────
  const posts = [
    { contentNl: '5 redenen waarom HR-bedrijven social media serieus moeten nemen in 2025. 📊\n\nTip 1: LinkedIn bereik is 3× hoger voor persoonlijke profielen dan company pages.\n\nWat doe jij om je team te activeren op socials? 👇', status: 'PUBLISHED', publishedAt: dayjs().subtract(2, 'day').toDate(), hashtags: ['#HR', '#LinkedIn', '#EmployerBranding'] },
    { contentNl: 'Wist je dat 78% van de B2B-beslissers social media gebruikt voor onderzoek vóór een aankoop?\n\nDaarniee wacht op hen — wees aanwezig waar jouw klanten zoeken. 🎯', status: 'SCHEDULED', scheduledAt: dayjs().add(1, 'day').set('hour', 10).toDate(), hashtags: ['#B2BMarketing', '#SocialSelling'] },
    { contentNl: 'Achter de schermen: zo plannen wij onze social media content voor een heel kwartaal in één middag. ⏱️\n\nMet Bloei AI maken we 26 posts per kwartaal — en ik review ze in 30 minuten.', status: 'DRAFT', hashtags: ['#Productiviteit', '#ContentMarketing'] },
    { contentNl: 'Vacature: zijn wij op zoek naar een ervaren Software Engineer in Amsterdam?\n\nDeel dit met je netwerk! 💼', status: 'SCHEDULED', scheduledAt: dayjs().add(3, 'day').set('hour', 9).toDate(), hashtags: ['#Vacature', '#TechJobs', '#Amsterdam'] },
  ]
  for (const p of posts) {
    await db.post.create({ data: { ...p, orgId, aiGenerated: false } } as never)
  }

  // ── Analytics snapshots (last 30 days) ───────────────
  for (let i = 29; i >= 0; i--) {
    const date = dayjs().subtract(i, 'day').startOf('day').toDate()
    await db.analyticsSnapshot.upsert({
      where: { orgId_platform_date: { orgId, platform: 'LINKEDIN', date } },
      update: {},
      create: {
        orgId, platform: 'LINKEDIN', date,
        totalPosts:       i % 7 < 2 ? 1 : 0,
        totalReach:       Math.round(200 + Math.random() * 800),
        totalImpressions: Math.round(400 + Math.random() * 1600),
        totalEngagement:  Math.round(20  + Math.random() * 80),
        avgEngagementRate:parseFloat((3 + Math.random() * 4).toFixed(2)),
        followerGrowth:   Math.round(Math.random() * 5),
        followerCount:    1200 + (29 - i) * 2,
        linkClicks:       Math.round(Math.random() * 30),
      },
    })
  }

  // ── Design system ─────────────────────────────────────
  await db.orgDesignSystem.upsert({
    where: { orgId },
    update: {},
    create: {
      orgId,
      brandName:       'Bloei Demo BV',
      brandDescription:'Een groeiend IT-adviesbureau in Amsterdam',
      targetAudience:  'HR-directeuren en marketing managers bij MKB-bedrijven',
      usp:             'Wij maken social media simpel én resultaatgericht voor B2B-bedrijven',
      toneKeywords:    ['professioneel', 'toegankelijk', 'betrouwbaar', 'no-nonsense'],
      avoidKeywords:   ['revolutionair', 'disruptief', 'synergy'],
      websiteUrl:      'https://demo.bloei.nl',
      examplePosts:    ['Groei is geen toeval. Het is een keuze. Elke dag een stap vooruit. 💪 #Groei #B2B'],
    },
  })

  console.log('✅ Seed klaar!')
  console.log('   Login: demo@bloei.nl / bloei_demo_2025')
  console.log(`   Org ID: ${orgId}`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
