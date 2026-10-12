import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { RawJob } from '../types.js';
import { classify } from './index.js';

const job = (over: Partial<RawJob>): RawJob => ({ source: 'teste', sourceId: '1', url: 'https://exemplo.com/vaga', title: 'Desenvolvedor', ...over });
const ok = (over: Partial<RawJob>) => {
  const r = classify(job(over));
  assert.ok(r.ok, `deveria aceitar: ${over.title} (${!r.ok ? r.reason : ''})`);
  return r.job;
};

describe('vaga de desenvolvimento?', () => {
  it('aceita títulos de dev em português e inglês', () => {
    for (const title of ['Desenvolvedor(a) Back-end Pleno', 'Pessoa Engenheira de Software Sênior', 'Senior Software Engineer', 'Analista Programador Java', 'Tech Lead'])
      ok({ title, regionHint: ['BR'] });
  });
  it('recusa vagas que não são de dev', () => {
    for (const title of ['Sales Engineer', 'Desenvolvedor de Negócios', 'Engenheiro Civil', 'Programador de PCP', 'Customer Success Manager', 'UX Designer']) {
      const r = classify(job({ title, regionHint: ['BR'] }));
      assert.equal(r.ok, false, title);
    }
  });
});

describe('casos da revisão', () => {
  it('nome do time não derruba cargo de dev', () => {
    for (const title of ['Software Engineer, Financial Engineering', 'Full Stack Software Engineer, Sales Platform', 'Senior Software Engineer, Legal Tech'])
      ok({ title, location: 'Remote (US)' });
    ok({ title: 'Desenvolvedor(a) Back End I (Serviços Financeiro)', regionHint: ['BR'] });
    assert.equal(classify(job({ title: 'Software Sales Engineer', location: 'Remote (US)' })).ok, false);
  });
  it('siglas de país não viram estados dos EUA', () => {
    for (const location of ['Kitchener, ON, CA / Remote (CA)', 'Bengaluru, KA, IN / Remote (IN)', 'Berlin, DE (Remote)', 'Buenos Aires, AR - Remote']) {
      const r = classify(job({ title: 'Software Engineer', location, workMode: 'remote' }));
      assert.ok(!r.ok || !r.job.regions.includes('US'), location);
    }
    assert.deepEqual(ok({ title: 'Software Engineer', location: 'San Francisco, CA (Remote)' }).regions, ['US']);
  });
  it('não junta cargos diferentes da mesma empresa', () => {
    const a = ok({ title: 'Software Engineer (Android)', company: 'X', location: 'Remote (US)' });
    const b = ok({ title: 'Software Engineer (Backend)', company: 'X', location: 'Remote (US)' });
    const c = ok({ title: 'Software Engineer (Android) (Remote)', company: 'X', location: 'Remote (US)' });
    assert.notEqual(a.dedupKey, b.dedupKey);
    assert.equal(a.dedupKey, c.dedupKey);
  });
});

describe('área', () => {
  const cases: [string, string][] = [
    ['Desenvolvedor Full Stack', 'fullstack'],
    ['Dev React/Node', 'fullstack'],
    ['Front-end Engineer', 'frontend'],
    ['Desenvolvedor Java Sênior', 'backend'],
    ['Engenheiro(a) de Dados', 'data'],
    ['Desenvolvedor Flutter', 'mobile'],
    ['DevOps Engineer (Python)', 'devops'],
    ['QA Automation Engineer', 'qa'],
  ];
  for (const [title, stack] of cases) it(title, () => assert.equal(ok({ title, regionHint: ['BR'] }).stack, stack));

  it('título genérico usa as tecnologias da descrição', () => {
    const j = ok({ title: 'Software Engineer', location: 'Remote (US)', description: '<p>We use React, Next.js, TypeScript, Node.js and PostgreSQL.</p>' });
    assert.equal(j.stack, 'fullstack');
  });
});

describe('nível', () => {
  const cases: [string, string][] = [
    ['Desenvolvedor Pleno', 'mid'],
    ['Dev Sr', 'senior'],
    ['Software Engineer II', 'mid'],
    ['Estágio em Desenvolvimento', 'intern'],
    ['Senior Tech Lead', 'lead'],
    ['Desenvolvedor PL/SQL', 'unknown'],
  ];
  for (const [title, level] of cases) it(title, () => assert.equal(ok({ title, regionHint: ['BR'] }).seniority, level));
});

describe('localização', () => {
  it('Brasil, Portugal e EUA', () => {
    assert.deepEqual(ok({ title: 'Developer', location: 'São Paulo - SP' }).regions, ['BR']);
    assert.deepEqual(ok({ title: 'Developer', location: 'Porto Alegre, RS' }).regions, ['BR']);
    assert.deepEqual(ok({ title: 'Developer', location: 'Lisboa, Portugal (Remoto)' }).regions, ['PT']);
    assert.deepEqual(ok({ title: 'Developer', location: 'Austin, TX or Remote' }).regions, ['US']);
  });
  it('fora do Brasil só vagas remotas', () => {
    const pt = classify(job({ title: 'Developer', location: 'Lisboa, Portugal', workMode: 'hybrid' }));
    assert.equal(pt.ok ? 'ok' : pt.reason, 'not-remote');
    const us = classify(job({ title: 'Developer', location: 'New York, NY' }));
    assert.equal(us.ok ? 'ok' : us.reason, 'not-remote');
    // presencial no Brasil continua valendo; numa vaga "SP ou NY" presencial fica só o Brasil
    assert.deepEqual(ok({ title: 'Developer', location: 'São Paulo, Brazil; New York, NY' }).regions, ['BR']);
    assert.deepEqual(ok({ title: 'Developer', location: 'New York, NY', description: 'This role is fully remote.' }).regions, ['US']);
  });
  it('remoto global e regiões', () => {
    assert.deepEqual(ok({ title: 'Developer', location: 'Anywhere in the World', workMode: 'remote' }).regions, ['WORLDWIDE']);
    assert.ok(ok({ title: 'Developer', location: 'Remote - LATAM' }).regions.includes('LATAM'));
    assert.ok(ok({ title: 'Developer', location: 'Remote (EU timezones)' }).regions.includes('EUROPE'));
  });
  it('descarta vagas só de outros países', () => {
    assert.equal(classify(job({ title: 'Developer', location: 'Remote (Germany)', workMode: 'remote', regionHint: ['US'] })).ok, false);
    assert.equal(classify(job({ title: 'Developer', location: 'London, UK' })).ok, false);
  });
  it('usa a região da fonte quando a vaga só diz "Remoto"', () => {
    assert.deepEqual(ok({ title: 'Desenvolvedor', location: 'Remoto', regionHint: ['BR'] }).regions, ['BR']);
  });
  it('modelo de trabalho', () => {
    assert.equal(ok({ title: 'Desenvolvedor', location: 'Curitiba (Híbrido)', regionHint: ['BR'] }).workMode, 'hybrid');
    assert.equal(ok({ title: '[Remoto] Desenvolvedor', regionHint: ['BR'] }).workMode, 'remote');
  });
});

describe('IA', () => {
  it('vibe coding / IA para programar', () => {
    const j = ok({
      title: 'Desenvolvedor Full Stack',
      regionHint: ['BR'],
      description: 'Uso de ferramentas de IA no dia a dia de desenvolvimento, como Cursor, GitHub Copilot ou Claude Code.',
    });
    assert.ok(j.ai.categories.includes('vibe'));
    assert.ok(j.ai.matches.includes('Claude Code'));
  });
  it('engenharia de IA / LLM', () => {
    const j = ok({ title: 'AI Engineer', location: 'Remote (US)', description: 'Build RAG pipelines with LangChain and LLMs.' });
    assert.ok(j.ai.categories.includes('llm'));
  });
  it('não confunde cursor de banco de dados nem menção solta a IA', () => {
    const j = ok({
      title: 'Backend Developer',
      location: 'Remote (US)',
      description: 'Iterate with a database cursor. We are an AI company using generative AI.',
    });
    assert.deepEqual(j.ai.categories, []);
  });
});
