// Öffnungszeiten-Parser aus index.html (Block zwischen „// <hours>“ und „// </hours>“)
import assert from "node:assert";
import { readFileSync } from "node:fs";
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const block = html.match(/\/\/ <hours>[^\n]*\n([\s\S]*?)\/\/ <\/hours>/);
assert.ok(block, "Öffnungszeiten-Block in index.html gefunden");
const { parseHours, hoursStatus, hoursGerman } = new Function(block[1] + "; return { parseHours, hoursStatus, hoursGerman };")();

// Mittwoch, 14.10.2026 und folgende Tage, lokale Zeit
const at = (day, hh, mm = 0) => new Date(2026, 9, 12 + day, hh, mm); // day 0 = Montag
const week = parseHours("Mo-Sa 07:00-22:00; Su off");
assert.deepEqual(week[0], [[420, 1320]]); assert.deepEqual(week[6], []);
assert.deepEqual(hoursStatus(week, at(2, 12)), { open: true, text: "bis 22:00" });
assert.deepEqual(hoursStatus(week, at(2, 6, 30)), { open: false, text: "öffnet um 07:00" });
assert.deepEqual(hoursStatus(week, at(2, 22, 15)), { open: false, text: "öffnet morgen um 07:00" });
assert.deepEqual(hoursStatus(week, at(5, 23)), { open: false, text: "öffnet Mo um 07:00" });

// mehrere Regeln, Feiertage, Mittagspause, über Mitternacht, 24/7
const w2 = parseHours("Mo-Fr 08:00-12:00, 14:00-20:00; Sa 08:00-16:00; Su,PH off");
assert.deepEqual(w2[0], [[480, 720], [840, 1200]]); assert.deepEqual(w2[5], [[480, 960]]); assert.deepEqual(w2[6], []);
assert.deepEqual(hoursStatus(w2, at(0, 13)), { open: false, text: "öffnet um 14:00" });
const w3 = parseHours("Mo-Fr 08:00-20:00, Sa 09:00-18:00; PH off");
assert.deepEqual(w3[5], [[540, 1080]]);
const late = parseHours("Fr-Sa 18:00-02:00");
assert.deepEqual(hoursStatus(late, at(5, 1)), { open: true, text: "bis 02:00" }); // Samstag 1 Uhr, noch vom Freitag
assert.deepEqual(hoursStatus(parseHours("24/7"), at(3, 3)), { open: true, text: "rund um die Uhr" });
assert.deepEqual(parseHours("Mo,We 08:00-12:00")[2], [[480, 720]]);
assert.equal(parseHours("Mo-Sa 07:00-22:00 \"Kasse bis 21:45\""), null, "zu speziell");
assert.equal(parseHours(""), null);
assert.equal(hoursGerman("Mo-Fr 08:00-20:00; Su,PH off"), "Mo-Fr 08:00-20:00; So,Feiertag geschlossen");
console.log("hours ok");
