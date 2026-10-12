import type { SourceDef } from '../types.js';
import { ATS_SOURCES } from './ats.js';
import { geekhunter, github, gupy, nerdin, programathor, remotar } from './brazil.js';
import {
  aidevboard,
  fourdayweek,
  himalayas,
  jobicy,
  remoteok,
  remotevibecoding,
  remotive,
  weworkremotely,
  workingnomads,
  ycombinator,
} from './global.js';
import { hackernews } from './hackernews.js';
import { adzuna, jooble } from './keyed.js';
import { itjobs, landingjobs, netempregos, teamlyzer, workablejobs } from './portugal.js';

/** Todas as fontes conhecidas. A ordem é a ordem de exibição na tela de fontes. */
export const SOURCES: SourceDef[] = [
  // Brasil
  gupy,
  github,
  remotar,
  programathor,
  nerdin,
  geekhunter,
  // Portugal
  itjobs,
  landingjobs,
  teamlyzer,
  workablejobs,
  netempregos,
  // Remoto global / EUA
  himalayas,
  weworkremotely,
  fourdayweek,
  jobicy,
  remoteok,
  hackernews,
  ycombinator,
  remotive,
  workingnomads,
  // Focadas em IA
  aidevboard,
  remotevibecoding,
  // Sites de carreira das empresas
  ...ATS_SOURCES,
  // Precisam de chave (grátis)
  adzuna,
  jooble,
];
