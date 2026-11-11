// node test.cjs: checks detection, measures false alarms and latency. Numbers feed FINDINGS.md.
const assert = require('node:assert/strict');
const { scan, redact, isWorkEmail } = require('./detect.js');

// Fake secrets are assembled at runtime so secret scanners don't flag this file.
const x = (n, c = 'a') => c.repeat(n);
const risky = [
  'AKIA' + 'Z7Q2W9E4R6T8Y1U3',
  'my key is sk-' + 'proj-' + x(32, 'B'),
  'use sk-' + 'ant-' + x(40, 'c') + ' for claude',
  'gh' + 'p_' + x(36, 'D'),
  'xox' + 'b-1234567890-' + x(20, 'e'),
  '-----BEGIN ' + 'RSA PRIVATE KEY-----\nMIIEow...',
  'Authorization: Bearer eyJ' + x(20, 'h') + '.' + x(20, 'i') + '.' + x(20, 'j'),
  'DB_PASSWORD=' + 'Tr0ub4dor&3xyz',
  'api_key: "' + x(24, 'k') + '"',
  'const token = "' + x(16, 'L') + '"',
  'Patient SSN 123-45-6789, please summarize the chart',
  'card 4111 1111 1111 1111 exp 12/29',
  'charge 5500-0000-0000-0004 for the invoice',
  'here is the customer list: bob@contoso.com, amy@contoso.com',
  'export:\nid,email\n1,raj@corp.com\n2,li@corp.com\n3,kim@corp.com',
  'cc everyone: a.smith@acme.com; b.jones@acme.com',
  'Bearer token: ' + x(20, 'n'),
  'secret: ' + x(12, 'm'),
  'ASIA' + 'Q1W2E3R4T5Y6U7I8 is the temp key',
  'password = "' + 'hunter2hunter2' + '"',
];
const benign = [
  'Write a haiku about autumn',
  'Explain the difference between TCP and UDP',
  'How do I center a div with flexbox?',
  'Summarize the plot of Hamlet in 3 sentences',
  'What is the time complexity of quicksort?',
  'Convert 72 Fahrenheit to Celsius',
  'Draft a polite follow-up after a job interview',
  'Our order 1234-5678 shipped late, write an apology',   // short number, not a card
  'Call me at 415-555-0142 tomorrow',                      // phone, not SSN (3-3-4)
  'The meeting is on 2026-11-01 at 12:30',
  'Write a regex that matches email addresses',
  'What does the word token mean in NLP?',                 // "token" without an assignment
  'Explain how password hashing with bcrypt works',
  'Generate SQL to count users by signup month',
  'The tracking number is 1Z999AA10123456784',
  'version 4.11.1.1111 of the library is out',
  'List 5 good names for a cat',
  'Translate "good morning" into Arabic',
  'ISBN 978-0-13-468599-1 is a good book',
  'My budget is $4,111 for 11 days',
  // single addresses are normal and must not alarm
  'email jane.doe@acme-health.com about the claim',
  'reply to ceo@bigco.io with the numbers',
  'what does support@stripe.com usually reply with?',
];

const t0 = process.hrtime.bigint();
const hits = risky.map(s => scan(s).length > 0);
const alarms = benign.map(s => scan(s).length > 0);
const per = Number(process.hrtime.bigint() - t0) / 1e6 / (risky.length + benign.length);

const missed = risky.filter((_, i) => !hits[i]);
const falseAlarms = benign.filter((_, i) => alarms[i]);
console.log(`caught ${hits.filter(Boolean).length}/${risky.length} risky, false alarms ${falseAlarms.length}/${benign.length}, ${per.toFixed(3)} ms per scan`);
if (missed.length) console.log('missed:', missed);
if (falseAlarms.length) console.log('false alarms:', falseAlarms);

// Behaviour checks
assert.equal(missed.length, 0, 'every risky sample should be caught');
assert.equal(falseAlarms.length, 0, 'no benign sample should alarm');
assert.ok(!redact('key ' + 'AKIA' + 'Z7Q2W9E4R6T8Y1U3').includes('AKIA'), 'redact removes the key');
assert.equal(redact('hello world'), 'hello world');
assert.ok(scan('4111 1111 1111 1112').length === 0, 'Luhn rejects a near-miss card');
assert.equal(scan('a@x.com a@x.com').length, 0, 'the same address twice is not a list');
assert.ok(isWorkEmail('alex@acme.com') && !isWorkEmail('alex@gmail.com'));
assert.ok(per < 1, 'scan must stay well under a frame (16ms)');
console.log('ok');
