const { PrismaClient } = require("./backend/node_modules/@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const stories = await prisma.story.findMany({ where: { deletedAt: null }, orderBy: [{ userId: 'asc' }, { createdAt: 'asc' }] });
  const byUser = new Map();
  for (const s of stories) {
    const key = `${s.userId}::${s.title}::${s.author}::${s.chapterTitle}`;
    if (!byUser.has(key)) byUser.set(key, []);
    byUser.get(key).push(s);
  }
  let removed = 0;
  for (const list of byUser.values()) {
    if (list.length < 2) continue;
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1];
      const curr = list[i];
      const dt = Math.abs(new Date(curr.createdAt).getTime() - new Date(prev.createdAt).getTime());
      if (dt <= 30000) {
        await prisma.story.update({ where: { id: curr.id }, data: { deletedAt: new Date() } });
        removed += 1;
      }
    }
  }
  console.log(JSON.stringify({ removed }));
  await prisma.$disconnect();
})().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
