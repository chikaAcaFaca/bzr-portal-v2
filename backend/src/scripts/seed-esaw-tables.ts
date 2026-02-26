/**
 * ESAW Classification Seed Script
 *
 * Seeds all 19 ESAW (European Statistics on Accidents at Work) classification tables
 * into the `esaw_classifications` table.
 *
 * Data source: Official ESAW methodology + Serbian translation from Pravilnik.
 *
 * Run: npx tsx src/scripts/seed-esaw-tables.ts
 */

import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { esawClassifications } from '../db/schema/esaw-classifications';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}
const client = postgres(connectionString);
const db = drizzle(client);

interface EsawEntry {
  tabelaBroj: number;
  tabelaNaziv: string;
  kod: string;
  naziv: string;
  roditeljKod?: string;
  nivo: number;
}

const esawData: EsawEntry[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // Tabela 1: Radni status povredjenog (Employment status)
  // ═══════════════════════════════════════════════════════════════════════════
  { tabelaBroj: 1, tabelaNaziv: 'Radni status povredjenog', kod: '10', naziv: 'Zaposleni', nivo: 1 },
  { tabelaBroj: 1, tabelaNaziv: 'Radni status povredjenog', kod: '11', naziv: 'Zaposleni na neodredjeno vreme', roditeljKod: '10', nivo: 2 },
  { tabelaBroj: 1, tabelaNaziv: 'Radni status povredjenog', kod: '12', naziv: 'Zaposleni na odredjeno vreme', roditeljKod: '10', nivo: 2 },
  { tabelaBroj: 1, tabelaNaziv: 'Radni status povredjenog', kod: '13', naziv: 'Zaposleni - pripravnik/praktikant', roditeljKod: '10', nivo: 2 },
  { tabelaBroj: 1, tabelaNaziv: 'Radni status povredjenog', kod: '20', naziv: 'Samozaposleni', nivo: 1 },
  { tabelaBroj: 1, tabelaNaziv: 'Radni status povredjenog', kod: '21', naziv: 'Samozaposleni - sa zaposlenima', roditeljKod: '20', nivo: 2 },
  { tabelaBroj: 1, tabelaNaziv: 'Radni status povredjenog', kod: '22', naziv: 'Samozaposleni - bez zaposlenih', roditeljKod: '20', nivo: 2 },
  { tabelaBroj: 1, tabelaNaziv: 'Radni status povredjenog', kod: '30', naziv: 'Pomazuci clan porodice', nivo: 1 },
  { tabelaBroj: 1, tabelaNaziv: 'Radni status povredjenog', kod: '99', naziv: 'Ostali radni statusi', nivo: 1 },

  // ═══════════════════════════════════════════════════════════════════════════
  // Tabela 2: Zanimanje povredjenog (Occupation - ISCO compatible)
  // ═══════════════════════════════════════════════════════════════════════════
  { tabelaBroj: 2, tabelaNaziv: 'Zanimanje povredjenog', kod: '1', naziv: 'Rukovodioci, funkcioneri i zakonodavci', nivo: 1 },
  { tabelaBroj: 2, tabelaNaziv: 'Zanimanje povredjenog', kod: '2', naziv: 'Strucnjaci i naucnici', nivo: 1 },
  { tabelaBroj: 2, tabelaNaziv: 'Zanimanje povredjenog', kod: '3', naziv: 'Inzenjeri, tehnicari i slicna zanimanja', nivo: 1 },
  { tabelaBroj: 2, tabelaNaziv: 'Zanimanje povredjenog', kod: '4', naziv: 'Administrativni sluzbenici', nivo: 1 },
  { tabelaBroj: 2, tabelaNaziv: 'Zanimanje povredjenog', kod: '5', naziv: 'Usluzna i trgovacka zanimanja', nivo: 1 },
  { tabelaBroj: 2, tabelaNaziv: 'Zanimanje povredjenog', kod: '6', naziv: 'Poljoprivrednici, sumari, ribari i srodni', nivo: 1 },
  { tabelaBroj: 2, tabelaNaziv: 'Zanimanje povredjenog', kod: '7', naziv: 'Zanatlije i srodni radnici', nivo: 1 },
  { tabelaBroj: 2, tabelaNaziv: 'Zanimanje povredjenog', kod: '8', naziv: 'Rukovaoci masinama i postrojenjima, monteri', nivo: 1 },
  { tabelaBroj: 2, tabelaNaziv: 'Zanimanje povredjenog', kod: '9', naziv: 'Jednostavna zanimanja', nivo: 1 },
  { tabelaBroj: 2, tabelaNaziv: 'Zanimanje povredjenog', kod: '0', naziv: 'Vojna zanimanja', nivo: 1 },

  // ═══════════════════════════════════════════════════════════════════════════
  // Tabela 3: Delatnost poslodavca (NACE compatible)
  // ═══════════════════════════════════════════════════════════════════════════
  { tabelaBroj: 3, tabelaNaziv: 'Delatnost poslodavca', kod: 'A', naziv: 'Poljoprivreda, sumarstvo i ribarstvo', nivo: 1 },
  { tabelaBroj: 3, tabelaNaziv: 'Delatnost poslodavca', kod: 'B', naziv: 'Rudarstvo', nivo: 1 },
  { tabelaBroj: 3, tabelaNaziv: 'Delatnost poslodavca', kod: 'C', naziv: 'Preradivacka industrija', nivo: 1 },
  { tabelaBroj: 3, tabelaNaziv: 'Delatnost poslodavca', kod: 'D', naziv: 'Snabdevanje elektricnom energijom, gasom, parom', nivo: 1 },
  { tabelaBroj: 3, tabelaNaziv: 'Delatnost poslodavca', kod: 'E', naziv: 'Snabdevanje vodom; upravljanje otpadnim vodama', nivo: 1 },
  { tabelaBroj: 3, tabelaNaziv: 'Delatnost poslodavca', kod: 'F', naziv: 'Gradjevinarstvo', nivo: 1 },
  { tabelaBroj: 3, tabelaNaziv: 'Delatnost poslodavca', kod: 'G', naziv: 'Trgovina na veliko i malo; popravka motornih vozila', nivo: 1 },
  { tabelaBroj: 3, tabelaNaziv: 'Delatnost poslodavca', kod: 'H', naziv: 'Saobracaj i skladistenje', nivo: 1 },
  { tabelaBroj: 3, tabelaNaziv: 'Delatnost poslodavca', kod: 'I', naziv: 'Usluge smestaja i ishrane', nivo: 1 },
  { tabelaBroj: 3, tabelaNaziv: 'Delatnost poslodavca', kod: 'J', naziv: 'Informisanje i komunikacije', nivo: 1 },
  { tabelaBroj: 3, tabelaNaziv: 'Delatnost poslodavca', kod: 'K', naziv: 'Finansijske delatnosti i delatnost osiguranja', nivo: 1 },
  { tabelaBroj: 3, tabelaNaziv: 'Delatnost poslodavca', kod: 'L', naziv: 'Poslovanje nekretninama', nivo: 1 },
  { tabelaBroj: 3, tabelaNaziv: 'Delatnost poslodavca', kod: 'M', naziv: 'Strucne, naucne i tehnicke delatnosti', nivo: 1 },
  { tabelaBroj: 3, tabelaNaziv: 'Delatnost poslodavca', kod: 'N', naziv: 'Administrativne i pomocne usluzne delatnosti', nivo: 1 },
  { tabelaBroj: 3, tabelaNaziv: 'Delatnost poslodavca', kod: 'O', naziv: 'Drzavna uprava i odbrana; obavezno socijalno osiguranje', nivo: 1 },
  { tabelaBroj: 3, tabelaNaziv: 'Delatnost poslodavca', kod: 'P', naziv: 'Obrazovanje', nivo: 1 },
  { tabelaBroj: 3, tabelaNaziv: 'Delatnost poslodavca', kod: 'Q', naziv: 'Zdravstvena i socijalna zastita', nivo: 1 },
  { tabelaBroj: 3, tabelaNaziv: 'Delatnost poslodavca', kod: 'R', naziv: 'Umetnost, zabava i rekreacija', nivo: 1 },
  { tabelaBroj: 3, tabelaNaziv: 'Delatnost poslodavca', kod: 'S', naziv: 'Ostale usluzne delatnosti', nivo: 1 },
  { tabelaBroj: 3, tabelaNaziv: 'Delatnost poslodavca', kod: 'T', naziv: 'Delatnost domacinstava kao poslodavaca', nivo: 1 },
  { tabelaBroj: 3, tabelaNaziv: 'Delatnost poslodavca', kod: 'U', naziv: 'Eksteritorijalne organizacije i tela', nivo: 1 },

  // ═══════════════════════════════════════════════════════════════════════════
  // Tabela 4: Vrsta radnog mesta (Type of workplace)
  // ═══════════════════════════════════════════════════════════════════════════
  { tabelaBroj: 4, tabelaNaziv: 'Vrsta radnog mesta', kod: '00', naziv: 'Nema podataka', nivo: 1 },
  { tabelaBroj: 4, tabelaNaziv: 'Vrsta radnog mesta', kod: '10', naziv: 'Industrijsko mesto - fabrika, radionica', nivo: 1 },
  { tabelaBroj: 4, tabelaNaziv: 'Vrsta radnog mesta', kod: '20', naziv: 'Gradiliste, kamenolom, otvoreni kop', nivo: 1 },
  { tabelaBroj: 4, tabelaNaziv: 'Vrsta radnog mesta', kod: '30', naziv: 'Mesto za poljoprivredu, stocarstvo, ribarstvo, sumarstvo', nivo: 1 },
  { tabelaBroj: 4, tabelaNaziv: 'Vrsta radnog mesta', kod: '40', naziv: 'Tercijarna delatnost, kancelariski prostor', nivo: 1 },
  { tabelaBroj: 4, tabelaNaziv: 'Vrsta radnog mesta', kod: '50', naziv: 'Zdravstvena ustanova', nivo: 1 },
  { tabelaBroj: 4, tabelaNaziv: 'Vrsta radnog mesta', kod: '60', naziv: 'Javno mesto', nivo: 1 },
  { tabelaBroj: 4, tabelaNaziv: 'Vrsta radnog mesta', kod: '70', naziv: 'Kod kuce', nivo: 1 },
  { tabelaBroj: 4, tabelaNaziv: 'Vrsta radnog mesta', kod: '80', naziv: 'Sportska arena', nivo: 1 },
  { tabelaBroj: 4, tabelaNaziv: 'Vrsta radnog mesta', kod: '90', naziv: 'U vazduhu, na vodi, pod vodom', nivo: 1 },
  { tabelaBroj: 4, tabelaNaziv: 'Vrsta radnog mesta', kod: '99', naziv: 'Drugo radno mesto', nivo: 1 },

  // ═══════════════════════════════════════════════════════════════════════════
  // Tabela 5: Radno okruzenje (Working environment)
  // ═══════════════════════════════════════════════════════════════════════════
  { tabelaBroj: 5, tabelaNaziv: 'Radno okruzenje', kod: '00', naziv: 'Nema podataka', nivo: 1 },
  { tabelaBroj: 5, tabelaNaziv: 'Radno okruzenje', kod: '10', naziv: 'Industrijski pogon', nivo: 1 },
  { tabelaBroj: 5, tabelaNaziv: 'Radno okruzenje', kod: '11', naziv: 'Proizvodni pogon, radionica, fabrika', roditeljKod: '10', nivo: 2 },
  { tabelaBroj: 5, tabelaNaziv: 'Radno okruzenje', kod: '12', naziv: 'Zona odrzavanja, popravke', roditeljKod: '10', nivo: 2 },
  { tabelaBroj: 5, tabelaNaziv: 'Radno okruzenje', kod: '13', naziv: 'Skladiste, stovariste', roditeljKod: '10', nivo: 2 },
  { tabelaBroj: 5, tabelaNaziv: 'Radno okruzenje', kod: '20', naziv: 'Gradiliste, graditeljstvo, kamenolom, rudnik', nivo: 1 },
  { tabelaBroj: 5, tabelaNaziv: 'Radno okruzenje', kod: '21', naziv: 'Gradiliste - zgrada u izgradnji', roditeljKod: '20', nivo: 2 },
  { tabelaBroj: 5, tabelaNaziv: 'Radno okruzenje', kod: '22', naziv: 'Gradiliste - rusenje', roditeljKod: '20', nivo: 2 },
  { tabelaBroj: 5, tabelaNaziv: 'Radno okruzenje', kod: '23', naziv: 'Kamenolom, rudnik, otvoreni kop', roditeljKod: '20', nivo: 2 },
  { tabelaBroj: 5, tabelaNaziv: 'Radno okruzenje', kod: '24', naziv: 'Podzemni rudnik', roditeljKod: '20', nivo: 2 },
  { tabelaBroj: 5, tabelaNaziv: 'Radno okruzenje', kod: '30', naziv: 'Mesto za poljoprivredu, sumarstvo, ribarstvo', nivo: 1 },
  { tabelaBroj: 5, tabelaNaziv: 'Radno okruzenje', kod: '40', naziv: 'Kancelariski prostor, zabavni prostor, ostalo', nivo: 1 },
  { tabelaBroj: 5, tabelaNaziv: 'Radno okruzenje', kod: '50', naziv: 'Zdravstvena ustanova', nivo: 1 },
  { tabelaBroj: 5, tabelaNaziv: 'Radno okruzenje', kod: '60', naziv: 'Javno mesto - komunikacija, transport', nivo: 1 },
  { tabelaBroj: 5, tabelaNaziv: 'Radno okruzenje', kod: '70', naziv: 'Kod kuce', nivo: 1 },
  { tabelaBroj: 5, tabelaNaziv: 'Radno okruzenje', kod: '80', naziv: 'Sportska arena', nivo: 1 },
  { tabelaBroj: 5, tabelaNaziv: 'Radno okruzenje', kod: '90', naziv: 'U vazduhu, na vodi, pod vodom, pod visokim pritiskom', nivo: 1 },
  { tabelaBroj: 5, tabelaNaziv: 'Radno okruzenje', kod: '99', naziv: 'Drugo radno okruzenje', nivo: 1 },

  // ═══════════════════════════════════════════════════════════════════════════
  // Tabela 6: Radni proces (Working process)
  // ═══════════════════════════════════════════════════════════════════════════
  { tabelaBroj: 6, tabelaNaziv: 'Radni proces', kod: '00', naziv: 'Nema podataka', nivo: 1 },
  { tabelaBroj: 6, tabelaNaziv: 'Radni proces', kod: '10', naziv: 'Proizvodnja, izrada, prerada, skladistenje', nivo: 1 },
  { tabelaBroj: 6, tabelaNaziv: 'Radni proces', kod: '20', naziv: 'Iskopavanje, gradjevinarstvo, odrzavanje, rusenje', nivo: 1 },
  { tabelaBroj: 6, tabelaNaziv: 'Radni proces', kod: '30', naziv: 'Poljoprivredna, sumarska, hortikulturna delatnost, ribarstvo', nivo: 1 },
  { tabelaBroj: 6, tabelaNaziv: 'Radni proces', kod: '40', naziv: 'Pružanje usluga - industriji, preduzecima, javnosti', nivo: 1 },
  { tabelaBroj: 6, tabelaNaziv: 'Radni proces', kod: '50', naziv: 'Pomocne delatnosti uz procese iz 10-40', nivo: 1 },
  { tabelaBroj: 6, tabelaNaziv: 'Radni proces', kod: '60', naziv: 'Kretanje, sport, umetnicki rad', nivo: 1 },
  { tabelaBroj: 6, tabelaNaziv: 'Radni proces', kod: '99', naziv: 'Drugi radni proces', nivo: 1 },

  // ═══════════════════════════════════════════════════════════════════════════
  // Tabela 7: Specificna fizicka aktivnost (Specific physical activity)
  // ═══════════════════════════════════════════════════════════════════════════
  { tabelaBroj: 7, tabelaNaziv: 'Specificna fizicka aktivnost', kod: '00', naziv: 'Nema podataka', nivo: 1 },
  { tabelaBroj: 7, tabelaNaziv: 'Specificna fizicka aktivnost', kod: '10', naziv: 'Rad sa masinama', nivo: 1 },
  { tabelaBroj: 7, tabelaNaziv: 'Specificna fizicka aktivnost', kod: '20', naziv: 'Rad sa rucnim alatom', nivo: 1 },
  { tabelaBroj: 7, tabelaNaziv: 'Specificna fizicka aktivnost', kod: '30', naziv: 'Upravljanje/vojna transportnog sredstva ili opreme', nivo: 1 },
  { tabelaBroj: 7, tabelaNaziv: 'Specificna fizicka aktivnost', kod: '40', naziv: 'Rucno rukovanje predmetima', nivo: 1 },
  { tabelaBroj: 7, tabelaNaziv: 'Specificna fizicka aktivnost', kod: '41', naziv: 'Rucno nosenje, podizanje', roditeljKod: '40', nivo: 2 },
  { tabelaBroj: 7, tabelaNaziv: 'Specificna fizicka aktivnost', kod: '42', naziv: 'Rucno guranje, povlacenje', roditeljKod: '40', nivo: 2 },
  { tabelaBroj: 7, tabelaNaziv: 'Specificna fizicka aktivnost', kod: '43', naziv: 'Rucno stavljanje, postavljanje, odlaganje', roditeljKod: '40', nivo: 2 },
  { tabelaBroj: 7, tabelaNaziv: 'Specificna fizicka aktivnost', kod: '50', naziv: 'Rucno prenošenje', nivo: 1 },
  { tabelaBroj: 7, tabelaNaziv: 'Specificna fizicka aktivnost', kod: '60', naziv: 'Kretanje', nivo: 1 },
  { tabelaBroj: 7, tabelaNaziv: 'Specificna fizicka aktivnost', kod: '61', naziv: 'Hodanje, trcanje, penjanje, silazenje', roditeljKod: '60', nivo: 2 },
  { tabelaBroj: 7, tabelaNaziv: 'Specificna fizicka aktivnost', kod: '62', naziv: 'Ulazak, izlazak', roditeljKod: '60', nivo: 2 },
  { tabelaBroj: 7, tabelaNaziv: 'Specificna fizicka aktivnost', kod: '70', naziv: 'Prisutnost', nivo: 1 },
  { tabelaBroj: 7, tabelaNaziv: 'Specificna fizicka aktivnost', kod: '99', naziv: 'Druga specificna fizicka aktivnost', nivo: 1 },

  // ═══════════════════════════════════════════════════════════════════════════
  // Tabela 8: Odstupanje od normalnog (Deviation)
  // ═══════════════════════════════════════════════════════════════════════════
  { tabelaBroj: 8, tabelaNaziv: 'Odstupanje od normalnog', kod: '00', naziv: 'Nema podataka', nivo: 1 },
  { tabelaBroj: 8, tabelaNaziv: 'Odstupanje od normalnog', kod: '10', naziv: 'Odstupanje usled elektricnih problema, eksplozije, pozara', nivo: 1 },
  { tabelaBroj: 8, tabelaNaziv: 'Odstupanje od normalnog', kod: '11', naziv: 'Elektricni problem - kratak spoj, staticko praznjenje', roditeljKod: '10', nivo: 2 },
  { tabelaBroj: 8, tabelaNaziv: 'Odstupanje od normalnog', kod: '12', naziv: 'Eksplozija', roditeljKod: '10', nivo: 2 },
  { tabelaBroj: 8, tabelaNaziv: 'Odstupanje od normalnog', kod: '13', naziv: 'Pozar, vatra', roditeljKod: '10', nivo: 2 },
  { tabelaBroj: 8, tabelaNaziv: 'Odstupanje od normalnog', kod: '20', naziv: 'Prelivanje, prevrtanje, curenje, isticanje, isparavanje, emisija', nivo: 1 },
  { tabelaBroj: 8, tabelaNaziv: 'Odstupanje od normalnog', kod: '30', naziv: 'Lom, pucanje, raspad, klizanje, pad, rusenje agensa', nivo: 1 },
  { tabelaBroj: 8, tabelaNaziv: 'Odstupanje od normalnog', kod: '31', naziv: 'Lom materijala - na spojevima, vezama', roditeljKod: '30', nivo: 2 },
  { tabelaBroj: 8, tabelaNaziv: 'Odstupanje od normalnog', kod: '32', naziv: 'Lom, pad agensa - odozgo', roditeljKod: '30', nivo: 2 },
  { tabelaBroj: 8, tabelaNaziv: 'Odstupanje od normalnog', kod: '33', naziv: 'Klizanje, rusenje, pad agensa - sa strane', roditeljKod: '30', nivo: 2 },
  { tabelaBroj: 8, tabelaNaziv: 'Odstupanje od normalnog', kod: '40', naziv: 'Gubitak kontrole nad masinom, transportom, opremom, alatom', nivo: 1 },
  { tabelaBroj: 8, tabelaNaziv: 'Odstupanje od normalnog', kod: '50', naziv: 'Klizanje ili sapletanje sa padom - pad osobe', nivo: 1 },
  { tabelaBroj: 8, tabelaNaziv: 'Odstupanje od normalnog', kod: '51', naziv: 'Pad osobe - na nizem nivou', roditeljKod: '50', nivo: 2 },
  { tabelaBroj: 8, tabelaNaziv: 'Odstupanje od normalnog', kod: '52', naziv: 'Pad osobe - na istom nivou', roditeljKod: '50', nivo: 2 },
  { tabelaBroj: 8, tabelaNaziv: 'Odstupanje od normalnog', kod: '60', naziv: 'Telesni pokret bez optrecenja (koji dovodi do povrede)', nivo: 1 },
  { tabelaBroj: 8, tabelaNaziv: 'Odstupanje od normalnog', kod: '70', naziv: 'Telesni pokret sa opterecenjem (koji dovodi do povrede)', nivo: 1 },
  { tabelaBroj: 8, tabelaNaziv: 'Odstupanje od normalnog', kod: '80', naziv: 'Sok, strah, nasilje, agresija, pretnja', nivo: 1 },
  { tabelaBroj: 8, tabelaNaziv: 'Odstupanje od normalnog', kod: '99', naziv: 'Drugo odstupanje', nivo: 1 },

  // ═══════════════════════════════════════════════════════════════════════════
  // Tabela 9: Nacin povredjivanja (Contact - mode of injury)
  // ═══════════════════════════════════════════════════════════════════════════
  { tabelaBroj: 9, tabelaNaziv: 'Nacin povredjivanja', kod: '00', naziv: 'Nema podataka', nivo: 1 },
  { tabelaBroj: 9, tabelaNaziv: 'Nacin povredjivanja', kod: '10', naziv: 'Kontakt sa strujom, temperaturom, opasnim materijama', nivo: 1 },
  { tabelaBroj: 9, tabelaNaziv: 'Nacin povredjivanja', kod: '11', naziv: 'Kontakt sa elektricnom strujom', roditeljKod: '10', nivo: 2 },
  { tabelaBroj: 9, tabelaNaziv: 'Nacin povredjivanja', kod: '12', naziv: 'Kontakt sa plamenom ili vrucim predmetom', roditeljKod: '10', nivo: 2 },
  { tabelaBroj: 9, tabelaNaziv: 'Nacin povredjivanja', kod: '13', naziv: 'Kontakt sa hladnim predmetom', roditeljKod: '10', nivo: 2 },
  { tabelaBroj: 9, tabelaNaziv: 'Nacin povredjivanja', kod: '14', naziv: 'Kontakt sa opasnom materijom - udisanje', roditeljKod: '10', nivo: 2 },
  { tabelaBroj: 9, tabelaNaziv: 'Nacin povredjivanja', kod: '15', naziv: 'Kontakt sa opasnom materijom - kontakt koze', roditeljKod: '10', nivo: 2 },
  { tabelaBroj: 9, tabelaNaziv: 'Nacin povredjivanja', kod: '20', naziv: 'Davljenje, zatrpavanje, obavijanje', nivo: 1 },
  { tabelaBroj: 9, tabelaNaziv: 'Nacin povredjivanja', kod: '30', naziv: 'Horizontalni ili vertikalni udar sa stacionarnim objektom', nivo: 1 },
  { tabelaBroj: 9, tabelaNaziv: 'Nacin povredjivanja', kod: '31', naziv: 'Udar - pad osobe na objekat', roditeljKod: '30', nivo: 2 },
  { tabelaBroj: 9, tabelaNaziv: 'Nacin povredjivanja', kod: '32', naziv: 'Udar pokretnim objektom - osoba je stajala', roditeljKod: '30', nivo: 2 },
  { tabelaBroj: 9, tabelaNaziv: 'Nacin povredjivanja', kod: '40', naziv: 'Udar pokretnim objektom - sudar', nivo: 1 },
  { tabelaBroj: 9, tabelaNaziv: 'Nacin povredjivanja', kod: '50', naziv: 'Kontakt sa ostrim, siljatim, grubim agensom', nivo: 1 },
  { tabelaBroj: 9, tabelaNaziv: 'Nacin povredjivanja', kod: '51', naziv: 'Kontakt sa ostrim agensom - seckanje, zasecanje', roditeljKod: '50', nivo: 2 },
  { tabelaBroj: 9, tabelaNaziv: 'Nacin povredjivanja', kod: '52', naziv: 'Kontakt sa siljatim agensom - bockanje, ubadanje', roditeljKod: '50', nivo: 2 },
  { tabelaBroj: 9, tabelaNaziv: 'Nacin povredjivanja', kod: '53', naziv: 'Kontakt sa grubim agensom - abrazija', roditeljKod: '50', nivo: 2 },
  { tabelaBroj: 9, tabelaNaziv: 'Nacin povredjivanja', kod: '60', naziv: 'Zahvatanje, drobljenje', nivo: 1 },
  { tabelaBroj: 9, tabelaNaziv: 'Nacin povredjivanja', kod: '70', naziv: 'Fizicko ili psihicko optrecenje', nivo: 1 },
  { tabelaBroj: 9, tabelaNaziv: 'Nacin povredjivanja', kod: '71', naziv: 'Fizicko optrecenje - muskuloskeletni sistem', roditeljKod: '70', nivo: 2 },
  { tabelaBroj: 9, tabelaNaziv: 'Nacin povredjivanja', kod: '72', naziv: 'Fizicko optrecenje - radijacija, buka, svetlost, pritisak', roditeljKod: '70', nivo: 2 },
  { tabelaBroj: 9, tabelaNaziv: 'Nacin povredjivanja', kod: '73', naziv: 'Psihicko opterecenje, sok', roditeljKod: '70', nivo: 2 },
  { tabelaBroj: 9, tabelaNaziv: 'Nacin povredjivanja', kod: '80', naziv: 'Ujed, udarac (od zivotinje ili coveka)', nivo: 1 },
  { tabelaBroj: 9, tabelaNaziv: 'Nacin povredjivanja', kod: '99', naziv: 'Drugi nacin povredjivanja', nivo: 1 },

  // ═══════════════════════════════════════════════════════════════════════════
  // Tabela 10: Materijalni uzrocnik odstupanja (Material agent of deviation)
  // ═══════════════════════════════════════════════════════════════════════════
  { tabelaBroj: 10, tabelaNaziv: 'Materijalni uzrocnik odstupanja', kod: '00', naziv: 'Nema materijalnog uzrocnika ili nema podataka', nivo: 1 },
  { tabelaBroj: 10, tabelaNaziv: 'Materijalni uzrocnik odstupanja', kod: '01', naziv: 'Zgrade, konstrukcije, povrsine - na zemlji', nivo: 1 },
  { tabelaBroj: 10, tabelaNaziv: 'Materijalni uzrocnik odstupanja', kod: '02', naziv: 'Zgrade, konstrukcije, povrsine - iznad zemlje', nivo: 1 },
  { tabelaBroj: 10, tabelaNaziv: 'Materijalni uzrocnik odstupanja', kod: '03', naziv: 'Zgrade, konstrukcije, povrsine - ispod zemlje', nivo: 1 },
  { tabelaBroj: 10, tabelaNaziv: 'Materijalni uzrocnik odstupanja', kod: '04', naziv: 'Sistemi za distribuciju materije, cevovodi', nivo: 1 },
  { tabelaBroj: 10, tabelaNaziv: 'Materijalni uzrocnik odstupanja', kod: '05', naziv: 'Motori, sistemi za prenos i skladistenje energije', nivo: 1 },
  { tabelaBroj: 10, tabelaNaziv: 'Materijalni uzrocnik odstupanja', kod: '06', naziv: 'Rucni alat - bez motora', nivo: 1 },
  { tabelaBroj: 10, tabelaNaziv: 'Materijalni uzrocnik odstupanja', kod: '07', naziv: 'Rucni alat - mehanizovani', nivo: 1 },
  { tabelaBroj: 10, tabelaNaziv: 'Materijalni uzrocnik odstupanja', kod: '08', naziv: 'Rucne mašine', nivo: 1 },
  { tabelaBroj: 10, tabelaNaziv: 'Materijalni uzrocnik odstupanja', kod: '09', naziv: 'Prenosive ili pokretne masine i oprema', nivo: 1 },
  { tabelaBroj: 10, tabelaNaziv: 'Materijalni uzrocnik odstupanja', kod: '10', naziv: 'Stacionarne masine i oprema', nivo: 1 },
  { tabelaBroj: 10, tabelaNaziv: 'Materijalni uzrocnik odstupanja', kod: '11', naziv: 'Uredjaji za transport i skladistenje', nivo: 1 },
  { tabelaBroj: 10, tabelaNaziv: 'Materijalni uzrocnik odstupanja', kod: '12', naziv: 'Drumska vozila', nivo: 1 },
  { tabelaBroj: 10, tabelaNaziv: 'Materijalni uzrocnik odstupanja', kod: '13', naziv: 'Ostala transportna vozila', nivo: 1 },
  { tabelaBroj: 10, tabelaNaziv: 'Materijalni uzrocnik odstupanja', kod: '14', naziv: 'Materijali, predmeti, proizvodi, delovi masina', nivo: 1 },
  { tabelaBroj: 10, tabelaNaziv: 'Materijalni uzrocnik odstupanja', kod: '15', naziv: 'Hemijske, eksplozivne, radioaktivne, bioloske materije', nivo: 1 },
  { tabelaBroj: 10, tabelaNaziv: 'Materijalni uzrocnik odstupanja', kod: '16', naziv: 'Sigurnosni uredjaji i oprema', nivo: 1 },
  { tabelaBroj: 10, tabelaNaziv: 'Materijalni uzrocnik odstupanja', kod: '17', naziv: 'Kancelariska oprema, licna oprema, sportska oprema, oruzje', nivo: 1 },
  { tabelaBroj: 10, tabelaNaziv: 'Materijalni uzrocnik odstupanja', kod: '18', naziv: 'Ziva bica i ljudi', nivo: 1 },
  { tabelaBroj: 10, tabelaNaziv: 'Materijalni uzrocnik odstupanja', kod: '19', naziv: 'Otpad razlicitih vrsta', nivo: 1 },
  { tabelaBroj: 10, tabelaNaziv: 'Materijalni uzrocnik odstupanja', kod: '20', naziv: 'Fizicke pojave i prirodni elementi', nivo: 1 },
  { tabelaBroj: 10, tabelaNaziv: 'Materijalni uzrocnik odstupanja', kod: '99', naziv: 'Drugi materijalni uzrocnici', nivo: 1 },

  // ═══════════════════════════════════════════════════════════════════════════
  // Tabela 11: Materijalni uzrocnik povredjivanja (Material agent of contact)
  // Same categories as Tabela 10 but for the contact/injury agent
  // ═══════════════════════════════════════════════════════════════════════════
  { tabelaBroj: 11, tabelaNaziv: 'Materijalni uzrocnik povredjivanja', kod: '00', naziv: 'Nema materijalnog uzrocnika ili nema podataka', nivo: 1 },
  { tabelaBroj: 11, tabelaNaziv: 'Materijalni uzrocnik povredjivanja', kod: '01', naziv: 'Zgrade, konstrukcije, povrsine - na zemlji', nivo: 1 },
  { tabelaBroj: 11, tabelaNaziv: 'Materijalni uzrocnik povredjivanja', kod: '02', naziv: 'Zgrade, konstrukcije, povrsine - iznad zemlje', nivo: 1 },
  { tabelaBroj: 11, tabelaNaziv: 'Materijalni uzrocnik povredjivanja', kod: '03', naziv: 'Zgrade, konstrukcije, povrsine - ispod zemlje', nivo: 1 },
  { tabelaBroj: 11, tabelaNaziv: 'Materijalni uzrocnik povredjivanja', kod: '04', naziv: 'Sistemi za distribuciju materije, cevovodi', nivo: 1 },
  { tabelaBroj: 11, tabelaNaziv: 'Materijalni uzrocnik povredjivanja', kod: '05', naziv: 'Motori, sistemi za prenos i skladistenje energije', nivo: 1 },
  { tabelaBroj: 11, tabelaNaziv: 'Materijalni uzrocnik povredjivanja', kod: '06', naziv: 'Rucni alat - bez motora', nivo: 1 },
  { tabelaBroj: 11, tabelaNaziv: 'Materijalni uzrocnik povredjivanja', kod: '07', naziv: 'Rucni alat - mehanizovani', nivo: 1 },
  { tabelaBroj: 11, tabelaNaziv: 'Materijalni uzrocnik povredjivanja', kod: '08', naziv: 'Rucne mašine', nivo: 1 },
  { tabelaBroj: 11, tabelaNaziv: 'Materijalni uzrocnik povredjivanja', kod: '09', naziv: 'Prenosive ili pokretne masine i oprema', nivo: 1 },
  { tabelaBroj: 11, tabelaNaziv: 'Materijalni uzrocnik povredjivanja', kod: '10', naziv: 'Stacionarne masine i oprema', nivo: 1 },
  { tabelaBroj: 11, tabelaNaziv: 'Materijalni uzrocnik povredjivanja', kod: '11', naziv: 'Uredjaji za transport i skladistenje', nivo: 1 },
  { tabelaBroj: 11, tabelaNaziv: 'Materijalni uzrocnik povredjivanja', kod: '12', naziv: 'Drumska vozila', nivo: 1 },
  { tabelaBroj: 11, tabelaNaziv: 'Materijalni uzrocnik povredjivanja', kod: '13', naziv: 'Ostala transportna vozila', nivo: 1 },
  { tabelaBroj: 11, tabelaNaziv: 'Materijalni uzrocnik povredjivanja', kod: '14', naziv: 'Materijali, predmeti, proizvodi, delovi masina', nivo: 1 },
  { tabelaBroj: 11, tabelaNaziv: 'Materijalni uzrocnik povredjivanja', kod: '15', naziv: 'Hemijske, eksplozivne, radioaktivne, bioloske materije', nivo: 1 },
  { tabelaBroj: 11, tabelaNaziv: 'Materijalni uzrocnik povredjivanja', kod: '16', naziv: 'Sigurnosni uredjaji i oprema', nivo: 1 },
  { tabelaBroj: 11, tabelaNaziv: 'Materijalni uzrocnik povredjivanja', kod: '17', naziv: 'Kancelariska oprema, licna oprema, sportska oprema, oruzje', nivo: 1 },
  { tabelaBroj: 11, tabelaNaziv: 'Materijalni uzrocnik povredjivanja', kod: '18', naziv: 'Ziva bica i ljudi', nivo: 1 },
  { tabelaBroj: 11, tabelaNaziv: 'Materijalni uzrocnik povredjivanja', kod: '19', naziv: 'Otpad razlicitih vrsta', nivo: 1 },
  { tabelaBroj: 11, tabelaNaziv: 'Materijalni uzrocnik povredjivanja', kod: '20', naziv: 'Fizicke pojave i prirodni elementi', nivo: 1 },
  { tabelaBroj: 11, tabelaNaziv: 'Materijalni uzrocnik povredjivanja', kod: '99', naziv: 'Drugi materijalni uzrocnici', nivo: 1 },

  // ═══════════════════════════════════════════════════════════════════════════
  // Tabela 12: Povredjeni deo tela (Part of body injured)
  // ═══════════════════════════════════════════════════════════════════════════
  { tabelaBroj: 12, tabelaNaziv: 'Povredjeni deo tela', kod: '00', naziv: 'Nema podataka', nivo: 1 },
  { tabelaBroj: 12, tabelaNaziv: 'Povredjeni deo tela', kod: '10', naziv: 'Glava', nivo: 1 },
  { tabelaBroj: 12, tabelaNaziv: 'Povredjeni deo tela', kod: '11', naziv: 'Glava - mozak i lobanjske kosti', roditeljKod: '10', nivo: 2 },
  { tabelaBroj: 12, tabelaNaziv: 'Povredjeni deo tela', kod: '12', naziv: 'Glava - lice', roditeljKod: '10', nivo: 2 },
  { tabelaBroj: 12, tabelaNaziv: 'Povredjeni deo tela', kod: '13', naziv: 'Glava - oko/oci', roditeljKod: '10', nivo: 2 },
  { tabelaBroj: 12, tabelaNaziv: 'Povredjeni deo tela', kod: '14', naziv: 'Glava - uvo/usi', roditeljKod: '10', nivo: 2 },
  { tabelaBroj: 12, tabelaNaziv: 'Povredjeni deo tela', kod: '15', naziv: 'Glava - zubi', roditeljKod: '10', nivo: 2 },
  { tabelaBroj: 12, tabelaNaziv: 'Povredjeni deo tela', kod: '18', naziv: 'Glava - vise zona', roditeljKod: '10', nivo: 2 },
  { tabelaBroj: 12, tabelaNaziv: 'Povredjeni deo tela', kod: '20', naziv: 'Vrat, ukljucujuci kicmu i kicmene prsljene', nivo: 1 },
  { tabelaBroj: 12, tabelaNaziv: 'Povredjeni deo tela', kod: '30', naziv: 'Ledja, ukljucujuci kicmu i kicmene prsljene', nivo: 1 },
  { tabelaBroj: 12, tabelaNaziv: 'Povredjeni deo tela', kod: '40', naziv: 'Trup i organi', nivo: 1 },
  { tabelaBroj: 12, tabelaNaziv: 'Povredjeni deo tela', kod: '41', naziv: 'Rebra, zglobovi ukljucujuci lopatice i klavikule', roditeljKod: '40', nivo: 2 },
  { tabelaBroj: 12, tabelaNaziv: 'Povredjeni deo tela', kod: '42', naziv: 'Grudni kos ukljucujuci organe', roditeljKod: '40', nivo: 2 },
  { tabelaBroj: 12, tabelaNaziv: 'Povredjeni deo tela', kod: '43', naziv: 'Stomacna i karlicna regija ukljucujuci organe', roditeljKod: '40', nivo: 2 },
  { tabelaBroj: 12, tabelaNaziv: 'Povredjeni deo tela', kod: '50', naziv: 'Gornji ekstremiteti', nivo: 1 },
  { tabelaBroj: 12, tabelaNaziv: 'Povredjeni deo tela', kod: '51', naziv: 'Rame i rameni zglob', roditeljKod: '50', nivo: 2 },
  { tabelaBroj: 12, tabelaNaziv: 'Povredjeni deo tela', kod: '52', naziv: 'Ruka ukljucujuci lakat', roditeljKod: '50', nivo: 2 },
  { tabelaBroj: 12, tabelaNaziv: 'Povredjeni deo tela', kod: '53', naziv: 'Zglobovi ruku', roditeljKod: '50', nivo: 2 },
  { tabelaBroj: 12, tabelaNaziv: 'Povredjeni deo tela', kod: '54', naziv: 'Saka', roditeljKod: '50', nivo: 2 },
  { tabelaBroj: 12, tabelaNaziv: 'Povredjeni deo tela', kod: '55', naziv: 'Prst/prsti', roditeljKod: '50', nivo: 2 },
  { tabelaBroj: 12, tabelaNaziv: 'Povredjeni deo tela', kod: '60', naziv: 'Donji ekstremiteti', nivo: 1 },
  { tabelaBroj: 12, tabelaNaziv: 'Povredjeni deo tela', kod: '61', naziv: 'Kuk i kukni zglob', roditeljKod: '60', nivo: 2 },
  { tabelaBroj: 12, tabelaNaziv: 'Povredjeni deo tela', kod: '62', naziv: 'Noga ukljucujuci koleno', roditeljKod: '60', nivo: 2 },
  { tabelaBroj: 12, tabelaNaziv: 'Povredjeni deo tela', kod: '63', naziv: 'Clanak/zglob stopala', roditeljKod: '60', nivo: 2 },
  { tabelaBroj: 12, tabelaNaziv: 'Povredjeni deo tela', kod: '64', naziv: 'Stopalo', roditeljKod: '60', nivo: 2 },
  { tabelaBroj: 12, tabelaNaziv: 'Povredjeni deo tela', kod: '65', naziv: 'Prst/prsti stopala', roditeljKod: '60', nivo: 2 },
  { tabelaBroj: 12, tabelaNaziv: 'Povredjeni deo tela', kod: '70', naziv: 'Celo telo i vise delova tela', nivo: 1 },
  { tabelaBroj: 12, tabelaNaziv: 'Povredjeni deo tela', kod: '78', naziv: 'Vise delova tela', roditeljKod: '70', nivo: 2 },
  { tabelaBroj: 12, tabelaNaziv: 'Povredjeni deo tela', kod: '99', naziv: 'Drugi delovi tela', nivo: 1 },

  // ═══════════════════════════════════════════════════════════════════════════
  // Tabela 13: Vrsta povrede (Type of injury)
  // ═══════════════════════════════════════════════════════════════════════════
  { tabelaBroj: 13, tabelaNaziv: 'Vrsta povrede', kod: '000', naziv: 'Nepoznata vrsta povrede', nivo: 1 },
  { tabelaBroj: 13, tabelaNaziv: 'Vrsta povrede', kod: '010', naziv: 'Rane i povrsinke povrede', nivo: 1 },
  { tabelaBroj: 13, tabelaNaziv: 'Vrsta povrede', kod: '011', naziv: 'Povrsinke povrede', roditeljKod: '010', nivo: 2 },
  { tabelaBroj: 13, tabelaNaziv: 'Vrsta povrede', kod: '012', naziv: 'Otvorene rane', roditeljKod: '010', nivo: 2 },
  { tabelaBroj: 13, tabelaNaziv: 'Vrsta povrede', kod: '020', naziv: 'Prelomi kostiju', nivo: 1 },
  { tabelaBroj: 13, tabelaNaziv: 'Vrsta povrede', kod: '021', naziv: 'Zatvoreni prelomi', roditeljKod: '020', nivo: 2 },
  { tabelaBroj: 13, tabelaNaziv: 'Vrsta povrede', kod: '022', naziv: 'Otvoreni prelomi', roditeljKod: '020', nivo: 2 },
  { tabelaBroj: 13, tabelaNaziv: 'Vrsta povrede', kod: '030', naziv: 'Iscasenja, uganuci i istegnuca', nivo: 1 },
  { tabelaBroj: 13, tabelaNaziv: 'Vrsta povrede', kod: '031', naziv: 'Iscasenja i subluksacije', roditeljKod: '030', nivo: 2 },
  { tabelaBroj: 13, tabelaNaziv: 'Vrsta povrede', kod: '032', naziv: 'Uganuci i istegnuca', roditeljKod: '030', nivo: 2 },
  { tabelaBroj: 13, tabelaNaziv: 'Vrsta povrede', kod: '040', naziv: 'Traumatske amputacije (gubitak delova tela)', nivo: 1 },
  { tabelaBroj: 13, tabelaNaziv: 'Vrsta povrede', kod: '050', naziv: 'Potres mozga i unutrasnje povrede', nivo: 1 },
  { tabelaBroj: 13, tabelaNaziv: 'Vrsta povrede', kod: '051', naziv: 'Potres mozga', roditeljKod: '050', nivo: 2 },
  { tabelaBroj: 13, tabelaNaziv: 'Vrsta povrede', kod: '052', naziv: 'Unutrasnje povrede', roditeljKod: '050', nivo: 2 },
  { tabelaBroj: 13, tabelaNaziv: 'Vrsta povrede', kod: '060', naziv: 'Opekotine, oparine i smrzotine', nivo: 1 },
  { tabelaBroj: 13, tabelaNaziv: 'Vrsta povrede', kod: '061', naziv: 'Opekotine i oparine (termicke)', roditeljKod: '060', nivo: 2 },
  { tabelaBroj: 13, tabelaNaziv: 'Vrsta povrede', kod: '062', naziv: 'Hemijske opekotine (nagrizanje)', roditeljKod: '060', nivo: 2 },
  { tabelaBroj: 13, tabelaNaziv: 'Vrsta povrede', kod: '063', naziv: 'Smrzotine', roditeljKod: '060', nivo: 2 },
  { tabelaBroj: 13, tabelaNaziv: 'Vrsta povrede', kod: '070', naziv: 'Trovanje i infekcije', nivo: 1 },
  { tabelaBroj: 13, tabelaNaziv: 'Vrsta povrede', kod: '071', naziv: 'Akutno trovanje', roditeljKod: '070', nivo: 2 },
  { tabelaBroj: 13, tabelaNaziv: 'Vrsta povrede', kod: '072', naziv: 'Akutne infekcije', roditeljKod: '070', nivo: 2 },
  { tabelaBroj: 13, tabelaNaziv: 'Vrsta povrede', kod: '080', naziv: 'Davljenje i gusenje', nivo: 1 },
  { tabelaBroj: 13, tabelaNaziv: 'Vrsta povrede', kod: '090', naziv: 'Efekti zvuka, vibracija, pritiska', nivo: 1 },
  { tabelaBroj: 13, tabelaNaziv: 'Vrsta povrede', kod: '100', naziv: 'Efekti ekstrema temperature, svetlosti, radijacije', nivo: 1 },
  { tabelaBroj: 13, tabelaNaziv: 'Vrsta povrede', kod: '110', naziv: 'Sok', nivo: 1 },
  { tabelaBroj: 13, tabelaNaziv: 'Vrsta povrede', kod: '120', naziv: 'Visestuke povrede', nivo: 1 },
  { tabelaBroj: 13, tabelaNaziv: 'Vrsta povrede', kod: '999', naziv: 'Ostale navedene povrede', nivo: 1 },

  // ═══════════════════════════════════════════════════════════════════════════
  // Tabela 14: Velicina preduzeca (Size of enterprise)
  // ═══════════════════════════════════════════════════════════════════════════
  { tabelaBroj: 14, tabelaNaziv: 'Velicina preduzeca', kod: '1', naziv: '1-9 zaposlenih (mikro)', nivo: 1 },
  { tabelaBroj: 14, tabelaNaziv: 'Velicina preduzeca', kod: '2', naziv: '10-49 zaposlenih (malo)', nivo: 1 },
  { tabelaBroj: 14, tabelaNaziv: 'Velicina preduzeca', kod: '3', naziv: '50-249 zaposlenih (srednje)', nivo: 1 },
  { tabelaBroj: 14, tabelaNaziv: 'Velicina preduzeca', kod: '4', naziv: '250-499 zaposlenih', nivo: 1 },
  { tabelaBroj: 14, tabelaNaziv: 'Velicina preduzeca', kod: '5', naziv: '500+ zaposlenih (veliko)', nivo: 1 },

  // ═══════════════════════════════════════════════════════════════════════════
  // Tabela 15: Drzavljanstvo (Nationality)
  // ═══════════════════════════════════════════════════════════════════════════
  { tabelaBroj: 15, tabelaNaziv: 'Drzavljanstvo', kod: 'RS', naziv: 'Republika Srbija', nivo: 1 },
  { tabelaBroj: 15, tabelaNaziv: 'Drzavljanstvo', kod: 'EU', naziv: 'Drzavljanin EU', nivo: 1 },
  { tabelaBroj: 15, tabelaNaziv: 'Drzavljanstvo', kod: 'XX', naziv: 'Ostalo/nepoznato', nivo: 1 },

  // ═══════════════════════════════════════════════════════════════════════════
  // Tabela 16: Geografska lokacija (Geographic location)
  // ═══════════════════════════════════════════════════════════════════════════
  { tabelaBroj: 16, tabelaNaziv: 'Geografska lokacija', kod: '00', naziv: 'Beogradski region', nivo: 1 },
  { tabelaBroj: 16, tabelaNaziv: 'Geografska lokacija', kod: '01', naziv: 'Region Vojvodine', nivo: 1 },
  { tabelaBroj: 16, tabelaNaziv: 'Geografska lokacija', kod: '02', naziv: 'Region Sumadije i Zapadne Srbije', nivo: 1 },
  { tabelaBroj: 16, tabelaNaziv: 'Geografska lokacija', kod: '03', naziv: 'Region Juzne i Istocne Srbije', nivo: 1 },
  { tabelaBroj: 16, tabelaNaziv: 'Geografska lokacija', kod: '04', naziv: 'Region Kosovo i Metohija', nivo: 1 },

  // ═══════════════════════════════════════════════════════════════════════════
  // Tabela 17: Vreme nesrece (Time of accident)
  // ═══════════════════════════════════════════════════════════════════════════
  { tabelaBroj: 17, tabelaNaziv: 'Vreme nesrece', kod: '1', naziv: '00:00-05:59', nivo: 1 },
  { tabelaBroj: 17, tabelaNaziv: 'Vreme nesrece', kod: '2', naziv: '06:00-09:59', nivo: 1 },
  { tabelaBroj: 17, tabelaNaziv: 'Vreme nesrece', kod: '3', naziv: '10:00-13:59', nivo: 1 },
  { tabelaBroj: 17, tabelaNaziv: 'Vreme nesrece', kod: '4', naziv: '14:00-17:59', nivo: 1 },
  { tabelaBroj: 17, tabelaNaziv: 'Vreme nesrece', kod: '5', naziv: '18:00-23:59', nivo: 1 },

  // ═══════════════════════════════════════════════════════════════════════════
  // Tabela 18: Dan u nedelji (Day of the week)
  // ═══════════════════════════════════════════════════════════════════════════
  { tabelaBroj: 18, tabelaNaziv: 'Dan u nedelji', kod: '1', naziv: 'Ponedeljak', nivo: 1 },
  { tabelaBroj: 18, tabelaNaziv: 'Dan u nedelji', kod: '2', naziv: 'Utorak', nivo: 1 },
  { tabelaBroj: 18, tabelaNaziv: 'Dan u nedelji', kod: '3', naziv: 'Sreda', nivo: 1 },
  { tabelaBroj: 18, tabelaNaziv: 'Dan u nedelji', kod: '4', naziv: 'Cetvrtak', nivo: 1 },
  { tabelaBroj: 18, tabelaNaziv: 'Dan u nedelji', kod: '5', naziv: 'Petak', nivo: 1 },
  { tabelaBroj: 18, tabelaNaziv: 'Dan u nedelji', kod: '6', naziv: 'Subota', nivo: 1 },
  { tabelaBroj: 18, tabelaNaziv: 'Dan u nedelji', kod: '7', naziv: 'Nedelja', nivo: 1 },

  // ═══════════════════════════════════════════════════════════════════════════
  // Tabela 19: Tezina povrede (Severity of injury)
  // ═══════════════════════════════════════════════════════════════════════════
  { tabelaBroj: 19, tabelaNaziv: 'Tezina povrede', kod: '1', naziv: 'Laka povreda', nivo: 1 },
  { tabelaBroj: 19, tabelaNaziv: 'Tezina povrede', kod: '2', naziv: 'Teska povreda', nivo: 1 },
  { tabelaBroj: 19, tabelaNaziv: 'Tezina povrede', kod: '3', naziv: 'Kolektivna povreda', nivo: 1 },
  { tabelaBroj: 19, tabelaNaziv: 'Tezina povrede', kod: '4', naziv: 'Smrtna povreda', nivo: 1 },
];

async function seedEsawTables() {
  console.log('🔄 Seeding ESAW classification tables...');
  console.log(`   Total entries: ${esawData.length}`);

  // Clear existing data
  await db.delete(esawClassifications);
  console.log('   Cleared existing ESAW data');

  // Insert in batches of 100
  const batchSize = 100;
  for (let i = 0; i < esawData.length; i += batchSize) {
    const batch = esawData.slice(i, i + batchSize);
    await db.insert(esawClassifications).values(batch);
    console.log(`   Inserted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(esawData.length / batchSize)}`);
  }

  // Summary
  const tableCounts = new Map<number, number>();
  for (const entry of esawData) {
    tableCounts.set(entry.tabelaBroj, (tableCounts.get(entry.tabelaBroj) || 0) + 1);
  }
  console.log('\n📊 ESAW Tables Summary:');
  for (const [table, count] of Array.from(tableCounts.entries()).sort((a, b) => a[0] - b[0])) {
    const name = esawData.find(e => e.tabelaBroj === table)?.tabelaNaziv || '';
    console.log(`   Tabela ${table}: ${name} (${count} entries)`);
  }

  console.log('\n✅ ESAW seed complete!');
  await client.end();
  process.exit(0);
}

seedEsawTables().catch((err) => {
  console.error('❌ ESAW seed failed:', err);
  client.end().then(() => process.exit(1));
});
