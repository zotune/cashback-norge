(function(){"use strict";const y={trumf:"Trumf",klarna:"Klarna",coupert:"Coupert",remember:"re:member",sas:"SAS",tfbank:"TF Bank",dnb:"DNB",curve:"Curve Pro",rabattkode:"Rabattkode",norskfamilie:"NF",logbuy:"LogBuy",obos:"OBOS",bob:"BOB",usbl:"USBL",bate:"Bate",tobb:"TOBB",naf:"NAF",tekna:"Tekna",nito:"NITO",sparebank1:"SB1 Ung",studentkortet:"Studentkortet",studenttorget:"StudentTorget",nettbonus:"NettBonus",spenn:"Spenn",spareborsen:"Sparebørsen",rabble:"rabble",dreams:"Dreams",utdanningibergen:"Utdanning i Bergen",unidays:"UNiDAYS",cbn:"♥",unio:"Unio",coop:"Coop",elkjop:"Elkjøp",akademikerne:"Akademikerne+",huseierne:"Huseierne",huseierforbundet:"Huseierforbundet",amcar:"AMCAR",horselsforbundet:"Hørselsforbundet",knbf:"KNBF",njff:"NJFF",pensjonistforbundet:"Pensjonistforbundet",kna:"KNA",syklistforeningen:"Syklistforeningen",revmatikerforbundet:"Revmatikerforbundet",redningsselskapet:"Redningsselskapet",lhl:"LHL",santander:"Santander",norwegian:"Norwegian",vestbo:"Vestbo",bbl:"BBL",elbilforeningen:"Elbilforeningen",ys:"YS",lofavor:"LOfavør"},w={trumf:`Trumf-bonus. Aktiver i Trumf-appen.
1 Trumf-kr ≈ 13,5 SAS EuroBonus-poeng.`,klarna:`Klarna+ medlemskap.
Plus: +0,5% (49 kr/mnd), Max: +1% (99 kr/mnd).`,coupert:`Coupert.
Gratis cashback. Logg inn hos Coupert og aktiver cashback før kjøpet.
Fullfør kjøpet på butikkens nettsted.`,remember:`re:member kredittkort.
Aktiver tilbud i re:member-appen før kjøp.`,sas:`SAS EuroBonus-poeng.
Aktiver tilbud på SAS sine sider.
Kr-verdi basert på Trumf-kurs (1 kr = 13,5 EB).`,tfbank:`TF Bank Mastercard.
Aktiver tilbud i TF Bank-appen.`,dnb:"DNB Spare. Aktiver i DNB-appen.",rabattkode:`Rabattkode fra rabattkode.no.
Lim inn koden i handlekurven.`,norskfamilie:`Norsk Familieøkonomi.
Krever medlemskap. Aktiver kjøp via norskfamilie.no.`,usbl:`USBL-tilbud.
Krever USBL-medlemskap og eventuell Bonabo-aktivering.`,bate:`Bate medlemsfordeler.
Krever Bate-medlemskap. Aktiver eller vis fordelen via bate.no.`,tobb:`TOBB medlemsfordeler.
Krever TOBB-medlemskap. Aktiver eller vis fordelen via tobb.no.`,bob:`BOB-medlemsfordel.
Krever BOB-medlemskap og gyldig medlemsbevis i BOB-appen.`,tekna:`Tekna medlemsfordeler.
Krever Tekna-medlemskap. Aktiver tilbud via tekna.no.`,nito:`NITO medlemsfordeler.
Krever NITO-medlemskap. Aktiver tilbud via nito.no.`,sparebank1:`SpareBank 1 Mastercard Ung.
20 % rabatt på utvalgte strømmetjenester.
Samlet inntil 500 kr per kalenderår.`,studentkortet:`Studentkortet.no
Gratis medlemskap for studenter i Norge.
Aktiver rabatt via studentkortet.no.`,nettbonus:`NettBonus.no
Gratis cashback-program.
Klikk deg via nettbonus.no til butikken for å tjene bonus.`,spenn:`Spenn (Strawberry).
Gratis poeng-program.
1 Spenn = 10 øre. Bruk på Norwegian, Strawberry, Uno-X m.fl.`,spareborsen:`Sparebørsen.
Gratis cashback — få prosent av kjøpet tilbake.
Klikk via spareborsen.no til butikken.`,rabble:`Rabble.
Gratis cashback-app.
Klikk via rabble.no til butikken for å tjene cashback.`,dreams:`Dreams.
Gratis spare-app med cashback.
Aktiver cashback via Dreams-appen.`,utdanningibergen:`Utdanning i Bergen.
Studentrabatter i Bergen.
Vis gyldig studentbevis for rabatt.`,unidays:`UNiDAYS studentrabatter.
Gratis for studenter.
Logg inn med UNiDAYS-konto for å aktivere.`,unio:`Unio medlemsfordeler.
Krever medlemskap i et Unio-forbund.
Oppgi rabattkode eller vis medlemsbevis.`,coop:`Coop medlemsfordeler.
Krever Coop-medlemskap.
Bruk rabattkode eller aktiver via Coop-siden der det kreves.`,elkjop:`Elkjøps Kundeklubb.
Krever gratis kundeklubbmedlemskap.
Aktiver eller hent kode via Elkjøp.`,akademikerne:`Akademikerne Pluss medlemsfordeler.
Krever medlemskap i en tilknyttet fagforening.
Aktiver via akademikernepluss.no eller A+-appen.`,huseierne:`Huseiernes medlemsfordeler.
Krever Huseierne-medlemskap.
Vis medlemskort eller hent rabattkode via huseierne.no.`,huseierforbundet:`Norges Huseierforbund og Bergen Huseierforening.
Krever medlemskap i den aktuelle foreningen.
Bruk den offisielle medlemssiden for vilkår og aktivering.`,amcar:`AMCARs rabattavtaler.
Krever gyldig AMCAR-medlemskap.
Se vilkår og aktivering på amcar.no.`,horselsforbundet:`Hørselsforbundets medlemsfordeler.
Krever medlemskap.
Se vilkår og aktivering på horselsforbundet.no.`,knbf:`Kongelig Norsk Båtforbunds medlemsfordeler.
Krever KNBF-medlemskap.
Se vilkår og aktivering på knbf.no.`,njff:`NJFF medlemsfordeler.
Krever NJFF-medlemskap.
Se vilkår og aktivering på njff.no.`,pensjonistforbundet:`Pensjonistforbundets medlemsfordeler.
Krever medlemskap.
Se vilkår og aktivering på pensjonistforbundet.no.`,kna:`KNAs medlemsfordeler.
Krever KNA-medlemskap.
Se vilkår og aktivering på kna.no.`,syklistforeningen:`Syklistforeningens medlemsfordeler.
Krever medlemskap i Syklistforeningen.
Se vilkår og aktivering på syklistforeningen.no.`,revmatikerforbundet:`Norsk Revmatikerforbunds medlemsfordeler.
Krever medlemskap.
Se vilkår og aktivering på revmatiker.no.`,redningsselskapet:`Redningsselskapets medlemsfordeler.
Krever medlemskap i Redningsselskapet.
Se vilkår og aktivering på rs.no.`,lhl:`LHLs medlemsfordeler (Landsforeningen for hjerte- og lungesyke).
Krever LHL-medlemskap.
Se vilkår og aktivering på lhl.no.`,santander:`Santander-kredittkort.
Krever kredittkort fra Santander.
Aktiver tilbudet via santander.dealpass.no.`,norwegian:`Norwegian Reward.
Gratis fordelsprogram.
Tjen CashPoints via partnersiden på norwegian.com.
1 CashPoint = 1 kr på Norwegian-kjøp.`,vestbo:`Vestbo medlemsfordeler.
Krever Vestbo-medlemskap.
Vis digitalt medlemskort via vestbo.no.`,bbl:`Boligbyggelagenes fordelsprogram.
Krever medlemskap i et tilknyttet boligbyggelag.
Registrer betalingskort på fordelerformedlemmer.no for automatisk bonus.`,elbilforeningen:`Norsk elbilforening.
Krever medlemskap i Elbilforeningen.
Aktiver via elbil.no/medlemsfordeler.`,ys:`YS medlemsfordeler.
Krever medlemskap i et YS-forbund.
Se vilkår på ys.no/medlemsfordeler.`,lofavor:`LOfavør.
Krever medlemskap i et LO-forbund.
Se vilkår på lofavor.no.`},B=[{pct:.0074,ebPer100kr:10,label:"SAS Amex",badge:"sas-amex",approx:!0,url:"https://www.americanexpress.com/nb-no/kredittkort/sas-classic/",tip:`10 EB/100 kr. Gratis kort.
2-for-1 på SAS-flyvninger i Europa.
Kr-verdi basert på Trumf-kurs (1 kr = 13,5 EB).`},{pct:.005,label:"Norwegian",badge:"norwegian",approx:!1,url:"https://www.banknorwegian.no/kredittkort/cashback/",tip:`0,5 % cashback (1:1 kr mot faktura)
eller CashPoints (1:1 kr på Norwegian.no).
Gratis kort, ingen årsavgift.`}],K=[{pct:.035,minPct:.02,maxPct:.05,label:"Crypto",badge:"crypto",approx:!1,url:"https://crypto.com/app/ns3fma5hou",tip:`Crypto.com Visa-kort.
Platin: +2 % (400 kr/mnd), Jade/Obsidian: +5 %.
Kombineres med annen cashback.`},{pct:.01,label:"Curve",badge:"curve",approx:!1,url:"https://www.curve.com/join#D5GXXJJD",tip:`Velg butikken i Curve-appen.
Maks 6 butikker (Pro, €9,99/mnd)
eller 12 (Pro+, €17,99/mnd).
Kombineres med annen cashback.`},{pct:.0075,minPct:.005,maxPct:.01,label:"Klarna",badge:"klarna",approx:!1,url:"https://www.klarna.com/no/medlemskap/",tip:`Plus: +0,5 % (49 kr/mnd)
Max: +1 % (99 kr/mnd)
Kombineres med annen cashback.`}],$=[{text:"Kron: 200 kr gratis i fond",emoji:"💰",url:"https://kron.no/app/invitert/nvu4d",affiliate:!0},{text:"Horde: Oversikt over alle kort + nedbetaling",emoji:"📊",url:"https://app.horde.no/66CS/verve?code=kloube",affiliate:!0},{text:"Kjøp en kaffe til utvikler ♥",emoji:"☕",url:"https://buymeacoffee.com/adore",affiliate:!1},{text:"Wise: Gratis internasjonal overføring opptil 5 000 kr",emoji:"🌍",url:"https://wise.com/invite/dic/mikaele41",affiliate:!0},{text:"Tibber strøm: 500 kr i Tibber Store eller 6 mnd fri avgift",emoji:"⚡",url:"https://invite.tibber.com/nwm7kene",affiliate:!0},{text:"Revolut: Gratis valutaveksling + bonus",emoji:"💳",url:"https://revolut.com/referrals?r=FELPJK",affiliate:!0},{text:"Crypto.com: 3-6 mnd gratis Spotify/Netflix",emoji:"🎵",url:"https://crypto.com/app/ns3fma5hou",affiliate:!0},{text:"NBX: 75 kr i BTC",emoji:"₿",url:"https://app.nbx.com/login/signup?referral=cjgOu54PvA",affiliate:!0},{text:"Curve: Samle alle kort i ett + gratis valutaveksling",emoji:"💱",url:"https://www.curve.com/join#D5GXXJJD",affiliate:!0},{text:"NettBonus: Inviter en venn og få 200 kr",emoji:"🎁",url:"https://nettbonus.no/r/28698",affiliate:!0},{text:"Sparebørsen: 50 kr settes inn med en gang du registrerer deg",emoji:"💰",url:"https://spareborsen.no/ref/cmoxhkl4bhevrnv9d6uo77an5",affiliate:!0}],x={"auto europe no":"auto europe","christiania glassmagasin":"christiania glasmagasin",hunkemöller:"hunkemøller","jakt og friluft":"jakt & friluft",kinoklubben:"kinoklubb",kitchn:"kitch'n","l´occitane":"l'occitane","nordic print":"nordicprint",nordicprint:"nordicprint","pyret og snäckan":"pyret & snäckan",racketspesialisten:"racketspecialisten","sky showtime":"skyshowtime","scandic hotels":"scandic","ellos no":"ellos","elite hotels of sweden":"elite hotels","db journey":"db","db™":"db",dbjourney:"db","budget leiebiler":"budget","amisol travel":"amisol","radisson hotels":"radisson hotel group","norton by symantec":"norton","marshall-hodetelefoner":"marshall","lyko online ab":"lyko","babyshop.no":"babyshop","barbershop.no":"barbershop","batteriexperten.com":"batteriexperten","bladkongen.no":"bladkongen","bodystore.no":"bodystore","cs megastore":"computersalg","cs megastore ":"computersalg","dekkonline.com":"dekkonline","elektroimportøren.no":"elektroimportøren","emp-shop.no":"emp","ginatricot.com":"gina tricot",ginatricot:"gina tricot","gullfunn.no":"gullfunn","hbo nordic":"hbo max","ilovedogs.no":"i love dogs","inkclub.no":"inkclub","inkclub.com":"inkclub","interflora.no":"interflora","kinogavekort.no":"kinogavekort","kinoklubb.no":"kinoklubb","lampemesteren.no":"lampemesteren","lensway.no":"lensway","life.no":"life","lunehjem.no":"lunehjem","makeupmekka.no":"makeup mekka",makeupmekka:"makeup mekka","nelly.com":"nelly",nlyman:"nly man",nordicnest:"nordic nest","outnorth.no":"outnorth","parfym.no":"parfym","polarnopyret.no":"polarn o. pyret","sportmann.no":"sportmann","stormberg.com":"stormberg","tirendo.no":"tirendo","urverket.no":"urverket","vistaprint.no":"vistaprint","vpg.no":"vpg","weekday.com":"weekday","zoo.no":"zoo","elon.no":"elon","kicks.no":"kicks","autodude.no / valostore.no":"autodude","vetzoo.no":"vetzoo","new vetzoo.no kco v.3 b2b recurring":"vetzoo",veromoda:"vero moda","bo hos strawberry":"strawberry","fortum strøm":"fortum","nordic choice":"strawberry","nordic choice hotels":"strawberry","strawberry student- og lærlingtilbud":"strawberry","ice.net":"ice","lytt og les gratis i 8 uker med nextory og tf bank mastercard":"nextory"};function M(r){const e=r.trim().toUpperCase();return e==="KR"?"NOK":e}const c=13.5;function b(r,e){const n=r.trim();if(n.length===0)return"?";if(R(n))return"Medlemspris";if(e==="sas"){const t=T(n);return t!==""?t:n}if(e==="trumf"){const t=O(n);return t!==""?`${n} (${t})`:n}return n}function R(r){return/^(?:medlemsfordel|medlemstilbud|medlemspris)$/i.test(r.trim())}function A(r){const e=b(r.reward,r.provider),n=k(e),t=p(r);if(n!==void 0&&t!==void 0&&!h(n.currency))return v(t);if(/\d+(?:[,.]\d+)?\s*kr\s*\/\s*/i.test(e)&&e.includes("+"))return e.replace(/\s+/g," ");const o=e.match(/(~)?(\d+(?:[,.]\d+)?\s*[-–]\s*\d+(?:[,.]\d+)?\s*%|\d+(?:[,.]\d+)?\s*%)/i);if(o!==null)return((o[1]??"")+o[2]).replace(/\s+/g," ");const a=e.match(/\d[\d\s]*(?:[,.]\d+)?(?:\s*[-–]\s*\d[\d\s]*(?:[,.]\d+)?)?\s*kr\s+totalsum/i);if(a!==null)return a[0].replace(/\s+/g," ");const s=e.match(/\d[\d\s]*(?:[,.]\d+)?\s*[-–]\s*\d[\d\s]*(?:[,.]\d+)?\s*kr(?:\/time|\s+per\s+time)?/i);if(s!==null)return s[0].replace(/\s+/g," ");const i=e.match(/\d[\d\s]*(?:[,.]\d+)?\s*kr(?:\/time|\s+per\s+time)?/i);return i!==null?i[0].replace(/\s+/g," "):/gratis\s+frakt/i.test(e)?"Gratis frakt":/gratis/i.test(e)?"Gratis":e.length<=14?e:void 0}function j(r,e){if(r.provider==="cbn"){const l=r.reward.match(/(\d+(?:[,.]\d+)?)\s*%/);if(l!==null){const m=Number.parseFloat(l[1]?.replace(",",".")??"0");return`${u(e*m/100)} kr støtte`}const d=k(r.reward);if(d!==void 0){const m=p(r);return m!==void 0&&!h(d.currency)?`${v(m)} støtte`:`${P(d.amount,d.currency)} støtte`}return""}const n=r.reward.trim(),t=n.match(/^([\d,.]+)%?-([\d,.]+)\s*%$/);if(t!==null){const l=Number.parseFloat((t[1]??"0").replace(",",".")),d=Number.parseFloat((t[2]??"0").replace(",",".")),m=e*l/100,N=e*d/100,U=m===N?`${u(m)} kr`:`${u(m)}-${u(N)} kr`;return S(U,l,d,e,r.provider)}const o=n.match(/^([\d,.]+)\s*%$/);if(o!==null){const l=Number.parseFloat((o[1]??"0").replace(",",".")),d=e*l/100;return S(`${u(d)} kr`,l,l,e,r.provider)}const a=n.match(/^([\d\s]+)\s*poeng\s+per\s+100\s*kr$/i);if(a!==null){const l=Number.parseInt((a[1]??"0").replace(/\s/g,""),10),d=Math.round(e*l/100),m=e*l/100/c;return`~${u(m)} kr (~${d} EB)`}const s=n.match(/^([\d\s]+)\s*poeng$/i);if(s!==null){const l=Number.parseInt((s[1]??"0").replace(/\s/g,""),10),d=l/c;return`~${u(d)} kr (~${l} EB)`}const i=n.match(/^([\d.]+)%$/);if(i!==null){const l=Number.parseFloat(i[1]??"0"),d=e*l/100;return`${u(d)} kr`}return""}function E(r,e){if(r.provider==="cbn")return 0;const n=r.reward.trim(),t=n.match(/^([\d,.]+)%?-([\d,.]+)\s*%$/);if(t!==null){const i=Number.parseFloat((t[2]??"0").replace(",","."));return e*i/100}const o=n.match(/^([\d,.]+)\s*%$/);if(o!==null)return e*Number.parseFloat((o[1]??"0").replace(",","."))/100;const a=n.match(/^([\d.]+)%$/);if(a!==null)return e*Number.parseFloat(a[1]??"0")/100;const s=n.match(/^([\d\s]+)\s*poeng\s+per\s+100\s*kr$/i);if(s!==null){const i=Number.parseInt((s[1]??"0").replace(/\s/g,""),10);return e*i/100/c}return 0}function F(r){const e=r.reward.trim().replace(/^(?:opptil|inntil|up to)\s+/i,""),n=p(r),t=e.match(/^([\d,.]+)%?-([\d,.]+)\s*%$/);if(t!==null)return Number.parseFloat((t[2]??"0").replace(",","."));const o=e.match(/^([\d,.]+)\s*%$/);if(o!==null)return Number.parseFloat((o[1]??"0").replace(",","."));const a=e.match(/^([\d\s]+)\s*poeng\s+per\s+100\s*kr$/i);if(a!==null)return Number.parseInt((a[1]??"0").replace(/\s/g,""),10)/c;const s=e.match(/^([\d.,]+)-([\d.,]+)\s*kr/i);if(s!==null)return Number.parseFloat((s[2]??"0").replace(",","."))/1e3;const i=e.match(/([\d.,]+)\s*kr/i);if(i!==null)return Number.parseFloat((i[1]??"0").replace(",","."))/1e3;const l=k(e);return l!==void 0?(n??l.amount)/1e3:0}function k(r){const e="(?:kr|NOK|SEK|DKK|EUR|USD|GBP)",n=new RegExp(`\\d[\\d\\s]*(?:[,.]\\d+)?\\s*[-–]\\s*(\\d[\\d\\s]*(?:[,.]\\d+)?)\\s*(${e})\\b`,"i"),t=r.match(n);if(t!==null){const s=f(t[1]??""),i=g(t[2]??"");if(s>0&&i!=="")return{amount:s,currency:i}}const o=new RegExp(`(\\d[\\d\\s]*(?:[,.]\\d+)?)\\s*(${e})\\b`,"i"),a=r.match(o);if(a!==null){const s=f(a[1]??""),i=g(a[2]??"");if(s>0&&i!=="")return{amount:s,currency:i}}}function f(r){const e=Number.parseFloat(r.replace(/\s/g,"").replace(",","."));return Number.isFinite(e)?e:0}function g(r){const e=r.trim().toUpperCase();return e==="KR"?"kr":e}function P(r,e){return`${u(r)} ${e}`}function v(r){return`~${u(Math.round(r))} kr`}function p(r){return typeof r.rewardSortValueNok=="number"&&Number.isFinite(r.rewardSortValueNok)?r.rewardSortValueNok:void 0}function h(r){return M(r)==="NOK"}function C(r,e){return r.split(`
`).map(n=>{const t=n.match(/^([\d,.]+)\s*%/);if(t!==null){const o=Number.parseFloat((t[1]??"0").replace(",",".")),a=e*o/100;return`${n} (${u(a)} kr)`}return n}).join(`
`)}function u(r){return Number.isInteger(r)?r.toString():r.toFixed(2).replace(".",",").replace(/,00$/,"")}function S(r,e,n,t,o){if(o==="trumf"){const a=Math.round(t*e/100*c),s=Math.round(t*n/100*c),i=a===s?`~${a} EB`:`~${a}-${s} EB`;return`${r} (${i})`}if(o==="sas"){const a=Math.round(t*e/100*c),s=Math.round(t*n/100*c),i=a===s?`~${a} EB`:`~${a}-${s} EB`;return`~${r} (${i})`}return r}function T(r){const e=r.match(/^([\d\s]+)\s*poeng$/i);if(e!==null){const t=Number.parseInt((e[1]??"0").replace(/\s/g,""),10);return`~${Math.round(t/c)} kr (~${t.toLocaleString("nb-NO")} EB)`}const n=r.match(/^([\d\s]+)\s*poeng\s+per\s+100\s*kr$/i);if(n!==null){const t=Number.parseInt((n[1]??"0").replace(/\s/g,""),10),o=t/c;return`~${L(o)} % (~${t} EB/100kr)`}return""}function O(r){const e=r.match(/^([\d,.]+)%?-([\d,.]+)\s*%$/);if(e!==null){const o=Number.parseFloat((e[1]??"0").replace(",",".")),a=Number.parseFloat((e[2]??"0").replace(",",".")),s=Math.round(o*c),i=Math.round(a*c);return`~${s}-${i} EB/100kr`}const n=r.match(/^([\d,.]+)\s*%$/);if(n!==null){const o=Number.parseFloat((n[1]??"0").replace(",","."));return`~${Math.round(o*c)} EB/100kr`}const t=r.match(/^([\d\s]+)\s*kr$/);if(t!==null){const o=Number.parseInt((t[1]??"0").replace(/\s/g,""),10);return`~${Math.round(o*c).toLocaleString("nb-NO")} EB`}return""}function L(r){return r%1===0?r.toString():r.toFixed(1).replace(".",",")}Object.assign(window,{SHARED:{EB_PER_TRUMF_KR:c,PROVIDER_NAMES:y,PROVIDER_TIPS:w,FREE_CARDS:B,PREMIUM_CARDS:K,SUPPORT_LINKS:$,MERCHANT_ALIASES:x,calculateCashback:j,calculateCashbackMaxKr:E,formatBreakdownWithAmounts:C,formatCompactRewardLabel:A,formatKr:u,formatRewardLabel:b,getMaxRewardPercent:F}})})();
