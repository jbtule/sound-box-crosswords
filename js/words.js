// Word packs. One word per line: the word with dashes between syllables, a space,
// then one emoji for the picture. Dashes drive the syllable colors and "Clap it",
// so split words the way a teacher would clap them. Letters only, 2–12 letters.
// `node scripts/check.mjs` validates these lists.

export const PACKS = {
  blends: {
    name: "Blends",
    note: "Two consonants side by side. Say both sounds: fr-og, ne-st.",
    list: `
frog 🐸
flag 🚩
drum 🥁
crab 🦀
sled 🛷
clock 🕰️
swan 🦢
skunk 🦨
plant 🪴
truck 🚚
nest 🪺
tent ⛺
hand ✋
gift 🎁
milk 🥛
drop 💧
stop 🛑
plug 🔌
brick 🧱
ant 🐜
spoon 🥄
tree 🌳
smile 😃
`,
  },

  bossy: {
    name: "Bossy R",
    note: "The R changes the vowel: ar, or, er, ir, ur.",
    list: `
car 🚗
star ⭐
horn 📯
corn 🌽
fork 🍴
shark 🦈
scarf 🧣
shirt 👕
bird 🐦
girl 👧
purse 👛
storm ⛈️
horse 🐴
dart 🎯
cart 🛒
worm 🪱
arm 💪
jar 🫙
tur-tle 🐢
bur-ger 🍔
`,
  },

  two: {
    name: "2 beats",
    note: "Clap the two beats, then spell one beat at a time.",
    list: `
rab-bit 🐇
pump-kin 🎃
bas-ket 🧺
sun-set 🌅
ro-bot 🤖
lem-on 🍋
ti-ger 🐅
mag-net 🧲
car-rot 🥕
kit-ten 🐈
pop-corn 🍿
pen-cil ✏️
rock-et 🚀
cac-tus 🌵
can-dle 🕯️
win-dow 🪟
sand-wich 🥪
drag-on 🐉
hel-met ⛑️
but-ton 🔘
pan-da 🐼
ze-bra 🦓
liz-ard 🦎
spi-der 🕷️
mon-key 🐒
chick-en 🐔
cup-cake 🧁
snow-man ⛄
`,
  },

  three: {
    name: "3 beats",
    note: "Three beats. Keep the last one from getting lost.",
    list: `
oc-to-pus 🐙
ba-nan-a 🍌
but-ter-fly 🦋
di-no-saur 🦕
kan-ga-roo 🦘
el-e-phant 🐘
to-ma-to 🍅
com-put-er 💻
um-brel-la ☂️
ham-bur-ger 🍔
broc-co-li 🥦
vol-ca-no 🌋
tel-e-scope 🔭
la-dy-bug 🐞
go-ril-la 🦍
pine-ap-ple 🍍
straw-ber-ry 🍓
croc-o-dile 🐊
fla-min-go 🦩
pi-an-o 🎹
`,
  },

  // Filled from the grown-up's own list (saved in localStorage).
  mine: {
    name: "My words",
    note: "Your own list. Change it under Grown-ups.",
    list: "",
  },
};

// Starter list for "My words": the -ore word family.
export const DEFAULT_CUSTOM = `ex-plore 🧭
store 🏪
more ➕
snore 😴
be-fore ⏮️
shore 🏖️
chore 🧹
score 🏆`;
