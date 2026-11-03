import 'dotenv/config';
import { seed } from '../src/lib/seed';
import { db } from '../src/lib/db';
seed().then(() => console.log('种子完成：12 节课程、4 阶段项目、6 个能力维度；不会覆盖学习记录。')).finally(() => db.$disconnect());
