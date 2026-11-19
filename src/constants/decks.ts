export interface StoryCard {
  id: string;
  prompt: string;
  type: 'open' | 'multiple_choice' | 'dilemma';
  options?: string[];
  tier?: 'Perception' | 'Connection' | 'Reflection';
  tierLevel?: 1 | 2 | 3;
  kicker?: string;
}

export interface GameDeck {
  id: string;
  indexNumber: string;
  title: string;
  subtitle: string;
  descriptor: string;
  cardColor: string;
  textColor: string;
  mutedTextColor: string;
  pillColor: string;
  pillHoverColor: string;
  progressTrackColor: string;
  progressFillColor: string;
  hasHotSeatTimer?: boolean;
  cards: StoryCard[];
}

export const GAME_DECKS: GameDeck[] = [
  {
    id: 'deep-conversations',
    indexNumber: '01',
    title: 'Deep Conversations',
    subtitle: '30 Cards · Pass & Play',
    descriptor: 'Vulnerable prompts and guessing cards built for late nights.',
    cardColor: '#9E472A',
    textColor: '#FFFFFF',
    mutedTextColor: 'rgba(255, 255, 255, 0.72)',
    pillColor: 'rgba(255, 255, 255, 0.16)',
    pillHoverColor: 'rgba(255, 255, 255, 0.24)',
    progressTrackColor: 'rgba(255, 255, 255, 0.28)',
    progressFillColor: '#FFFFFF',
    cards: [
      {
        id: 'dc-01',
        type: 'multiple_choice',
        kicker: 'Guessing Card',
        prompt: 'What do I do that gets you every time?',
        options: [
          'When I look you in the eyes',
          'When I kiss you first',
          "When I laugh so hard I can't stop",
          "When I tell you I'm proud of you",
        ],
      },
      {
        id: 'dc-02',
        type: 'multiple_choice',
        kicker: 'First Memory',
        prompt: 'What was the first thing you noticed about me?',
        options: [
          'My smile',
          'My body',
          'My eyes',
          'The way I carried myself',
        ],
      },
      {
        id: 'dc-03',
        type: 'open',
        kicker: 'Honesty',
        prompt: "You have a favorite memory of us. Don't say 'all of them.'",
      },
      {
        id: 'dc-04',
        type: 'open',
        kicker: 'Vulnerability',
        prompt: 'When did you realize you were actually falling for me?',
      },
      {
        id: 'dc-05',
        type: 'multiple_choice',
        kicker: 'Love Language',
        prompt: 'How do you feel most loved by me on a hard day?',
        options: [
          'Holding you quietly without trying to fix it',
          'Taking a chore off your plate before you ask',
          'Listening while you vent everything out',
          'Surprising you with your favorite comfort food',
        ],
      },
      {
        id: 'dc-06',
        type: 'open',
        kicker: 'Unspoken',
        prompt: 'What is one compliment you secretly wish I gave you more often?',
      },
      {
        id: 'dc-07',
        type: 'open',
        kicker: 'Perspective',
        prompt: 'What habit of mine used to confuse you, but now you find endearing?',
      },
      {
        id: 'dc-08',
        type: 'multiple_choice',
        kicker: 'Guessing Card',
        prompt: 'Where do I look happiest when we are together?',
        options: [
          'Late at night talking in the dark',
          'Cooking or eating together in the kitchen',
          'On a spontaneous drive with music up',
          'Doing absolutely nothing side by side',
        ],
      },
      {
        id: 'dc-09',
        type: 'open',
        kicker: 'Intimacy',
        prompt: 'What part of your life do you feel safest sharing only with me?',
      },
      {
        id: 'dc-10',
        type: 'open',
        kicker: 'Future',
        prompt: 'Describe an ordinary Sunday morning in our life five years from now.',
      },
      {
        id: 'dc-11',
        type: 'open',
        kicker: 'Reflection',
        prompt: 'What fear about relationships have I helped soften for you?',
      },
      {
        id: 'dc-12',
        type: 'multiple_choice',
        kicker: 'Guessing Card',
        prompt: 'What gives me away immediately when I am jealous or overthinking?',
        options: [
          'I go unusually quiet',
          'My tone gets extra polite',
          'I start asking very specific questions',
          'I pretend nothing bothers me',
        ],
      },
      {
        id: 'dc-13',
        type: 'open',
        kicker: 'Gratitude',
        prompt: 'What small thing did I do this month that meant more to you than I realized?',
      },
      {
        id: 'dc-14',
        type: 'open',
        kicker: 'Conflict & Repair',
        prompt: 'After a disagreement, what helps you feel connected to me again fastest?',
      },
      {
        id: 'dc-15',
        type: 'open',
        kicker: 'Closeness',
        prompt: 'When do you feel most desired by me?',
      },
      {
        id: 'dc-16',
        type: 'multiple_choice',
        kicker: 'Guessing Card',
        prompt: 'Which version of me do you think most people never get to see?',
        options: [
          'My softest, most protective side',
          'My goofy, unfiltered humor',
          'How deeply I worry about people I love',
          'How sentimental I actually am',
        ],
      },
      {
        id: 'dc-17',
        type: 'open',
        kicker: 'Growth',
        prompt: 'How have I changed you for the better since we met?',
      },
      {
        id: 'dc-18',
        type: 'open',
        kicker: 'Truth',
        prompt: 'What is something you were nervous to tell me early on?',
      },
      {
        id: 'dc-19',
        type: 'open',
        kicker: 'Detail',
        prompt: 'What physical detail about me would you recognize even in complete darkness?',
      },
      {
        id: 'dc-20',
        type: 'open',
        kicker: 'Support',
        prompt: 'What dream of yours feels scary to say out loud right now?',
      },
      {
        id: 'dc-21',
        type: 'multiple_choice',
        kicker: 'Guessing Card',
        prompt: 'What kind of apology works best on me?',
        options: [
          'A sincere hug before any words',
          'Owning the specific mistake directly',
          'Giving me ten minutes to cool off first',
          'A handwritten note or thoughtful text',
        ],
      },
      {
        id: 'dc-22',
        type: 'open',
        kicker: 'Memory',
        prompt: 'If you could replay our first real date from start to finish, what moment would you pause?',
      },
      {
        id: 'dc-23',
        type: 'open',
        kicker: 'Emotions',
        prompt: 'What do I need more reassurance about than I usually admit?',
      },
      {
        id: 'dc-24',
        type: 'open',
        kicker: 'Rituals',
        prompt: 'What little ritual of ours should we protect no matter how busy life gets?',
      },
      {
        id: 'dc-25',
        type: 'open',
        kicker: 'Admiration',
        prompt: 'When have you felt proudest watching me handle something difficult?',
      },
      {
        id: 'dc-26',
        type: 'open',
        kicker: 'Boundaries',
        prompt: 'Is there anything between us right now that deserves a softer, honest conversation?',
      },
      {
        id: 'dc-27',
        type: 'multiple_choice',
        kicker: 'Guessing Card',
        prompt: 'When I miss you during the day, what am I most likely thinking about?',
        options: [
          'Your laugh or something funny you said',
          'The last time we kissed',
          'What we are doing later tonight',
          'A random song or place that reminded me of you',
        ],
      },
      {
        id: 'dc-28',
        type: 'open',
        kicker: 'Trust',
        prompt: 'What makes our relationship feel unmistakably different from past ones?',
      },
      {
        id: 'dc-29',
        type: 'open',
        kicker: 'Presence',
        prompt: 'What is one thing we could do this weekend that would make you feel deeply cared for?',
      },
      {
        id: 'dc-30',
        type: 'open',
        kicker: 'Closing',
        prompt: 'Look at each other for ten seconds, then say one thing you are grateful we survived or built.',
      },
    ],
  },
  {
    id: 'whos-most-likely-to',
    indexNumber: '02',
    title: "Who's Most Likely To",
    subtitle: '25 Cards · Quick Fire',
    descriptor: 'Rapid-fire relationship scenarios built for playful debates.',
    cardColor: '#8B4367',
    textColor: '#FFFFFF',
    mutedTextColor: 'rgba(255, 255, 255, 0.72)',
    pillColor: 'rgba(255, 255, 255, 0.16)',
    pillHoverColor: 'rgba(255, 255, 255, 0.24)',
    progressTrackColor: 'rgba(255, 255, 255, 0.28)',
    progressFillColor: '#FFFFFF',
    cards: [
      {
        id: 'wml-01',
        type: 'multiple_choice',
        kicker: 'Count to Three',
        prompt: "Who's most likely to start an argument over where to eat?",
        options: ['Me', 'You', 'Both of us in the car', 'Neither — we just starve'],
      },
      {
        id: 'wml-02',
        type: 'multiple_choice',
        kicker: 'Count to Three',
        prompt: "Who's most likely to say 'I'm not tired' and fall asleep in four minutes?",
        options: ['Me', 'You', 'Whoever picks the movie', 'Depends on the wine'],
      },
      {
        id: 'wml-03',
        type: 'open',
        kicker: 'Debate',
        prompt: "Who's most likely to apologize first even when they weren't wrong?",
      },
      {
        id: 'wml-04',
        type: 'open',
        kicker: 'Debate',
        prompt: "Who's most likely to spend forty minutes getting ready after saying 'five minutes'?",
      },
      {
        id: 'wml-05',
        type: 'open',
        kicker: 'Debate',
        prompt: "Who's most likely to cry at a commercial involving a dog or an old couple?",
      },
      {
        id: 'wml-06',
        type: 'open',
        kicker: 'Debate',
        prompt: "Who's most likely to secretly screenshot a cute text from the other person?",
      },
      {
        id: 'wml-07',
        type: 'open',
        kicker: 'Debate',
        prompt: "Who's most likely to plan an entire weekend getaway at 1 a.m.?",
      },
      {
        id: 'wml-08',
        type: 'open',
        kicker: 'Debate',
        prompt: "Who's most likely to steal all the blankets by 3 a.m.?",
      },
      {
        id: 'wml-09',
        type: 'open',
        kicker: 'Debate',
        prompt: "Who's most likely to laugh during a completely serious moment?",
      },
      {
        id: 'wml-10',
        type: 'open',
        kicker: 'Debate',
        prompt: "Who's most likely to eat the leftovers the other person was saving all day?",
      },
      {
        id: 'wml-11',
        type: 'open',
        kicker: 'Debate',
        prompt: "Who's most likely to turn a quick Target run into a $140 trip?",
      },
      {
        id: 'wml-12',
        type: 'open',
        kicker: 'Debate',
        prompt: "Who's most likely to overpack three suitcases for a two-night trip?",
      },
      {
        id: 'wml-13',
        type: 'open',
        kicker: 'Debate',
        prompt: "Who's most likely to say 'I told you so' with just a raised eyebrow?",
      },
      {
        id: 'wml-14',
        type: 'open',
        kicker: 'Debate',
        prompt: "Who's most likely to befriend the barista, Uber driver, or waiter within two minutes?",
      },
      {
        id: 'wml-15',
        type: 'open',
        kicker: 'Debate',
        prompt: "Who's most likely to remember exact dates, outfits, and what we ate months ago?",
      },
      {
        id: 'wml-16',
        type: 'open',
        kicker: 'Debate',
        prompt: "Who's most likely to get competitive over a casual board game?",
      },
      {
        id: 'wml-17',
        type: 'open',
        kicker: 'Debate',
        prompt: "Who's most likely to keep a secret surprise for weeks without slipping?",
      },
      {
        id: 'wml-18',
        type: 'open',
        kicker: 'Debate',
        prompt: "Who's most likely to leave voice notes that are basically a podcast?",
      },
      {
        id: 'wml-19',
        type: 'open',
        kicker: 'Debate',
        prompt: "Who's most likely to suggest adopting a pet 'just to look'?",
      },
      {
        id: 'wml-20',
        type: 'open',
        kicker: 'Debate',
        prompt: "Who's most likely to insist on taking the scenic route and get us slightly lost?",
      },
      {
        id: 'wml-21',
        type: 'open',
        kicker: 'Debate',
        prompt: "Who's most likely to check in twice just to make sure the other got home safe?",
      },
      {
        id: 'wml-22',
        type: 'open',
        kicker: 'Debate',
        prompt: "Who's most likely to order the weirdest thing on the menu and love it?",
      },
      {
        id: 'wml-23',
        type: 'open',
        kicker: 'Debate',
        prompt: "Who's most likely to get jealous first — and deny it longest?",
      },
      {
        id: 'wml-24',
        type: 'open',
        kicker: 'Debate',
        prompt: "Who's most likely to stay up late talking when both of you have early mornings?",
      },
      {
        id: 'wml-25',
        type: 'open',
        kicker: 'Debate',
        prompt: "Who's most likely to brag about the other person when they aren't in the room?",
      },
    ],
  },
  {
    id: 'were-not-really-strangers',
    indexNumber: '03',
    title: "We're Not Really Strangers",
    subtitle: '30 Cards · 3 Escalating Tiers',
    descriptor: 'Perception, Connection, and Reflection in rising emotional depth.',
    cardColor: '#F4C2C2',
    textColor: '#1A1113',
    mutedTextColor: 'rgba(26, 17, 19, 0.62)',
    pillColor: 'rgba(26, 17, 19, 0.09)',
    pillHoverColor: 'rgba(26, 17, 19, 0.16)',
    progressTrackColor: 'rgba(26, 17, 19, 0.18)',
    progressFillColor: '#1A1113',
    cards: [
      // Level 1: Perception (10)
      {
        id: 'wnrs-01',
        type: 'open',
        tier: 'Perception',
        tierLevel: 1,
        prompt: 'What was your very first impression of me before we actually knew each other?',
      },
      {
        id: 'wnrs-02',
        type: 'open',
        tier: 'Perception',
        tierLevel: 1,
        prompt: 'What do you think I am hardest on myself about?',
      },
      {
        id: 'wnrs-03',
        type: 'multiple_choice',
        tier: 'Perception',
        tierLevel: 1,
        prompt: 'Which assumption about me turned out to be completely wrong?',
        options: [
          'That I was guarded or hard to read',
          'That I always had everything figured out',
          'That I cared less than I showed',
          'That our personalities were opposites',
        ],
      },
      {
        id: 'wnrs-04',
        type: 'open',
        tier: 'Perception',
        tierLevel: 1,
        prompt: 'What kind of energy do you think I bring into a room full of strangers?',
      },
      {
        id: 'wnrs-05',
        type: 'open',
        tier: 'Perception',
        tierLevel: 1,
        prompt: 'What do you think my biggest tell is when I am trying to hide that I am stressed?',
      },
      {
        id: 'wnrs-06',
        type: 'open',
        tier: 'Perception',
        tierLevel: 1,
        prompt: 'If someone asked you to describe my laugh without using the word cute, how would you?',
      },
      {
        id: 'wnrs-07',
        type: 'open',
        tier: 'Perception',
        tierLevel: 1,
        prompt: 'What song, season, or time of day reminds you most of my personality?',
      },
      {
        id: 'wnrs-08',
        type: 'open',
        tier: 'Perception',
        tierLevel: 1,
        prompt: 'What do you think I value more than almost anything else in a partner?',
      },
      {
        id: 'wnrs-09',
        type: 'open',
        tier: 'Perception',
        tierLevel: 1,
        prompt: 'Where do you think I feel most like myself?',
      },
      {
        id: 'wnrs-10',
        type: 'open',
        tier: 'Perception',
        tierLevel: 1,
        prompt: 'What is something you noticed about me recently that you had never noticed before?',
      },
      // Level 2: Connection (10)
      {
        id: 'wnrs-11',
        type: 'open',
        tier: 'Connection',
        tierLevel: 2,
        prompt: 'What are you still learning how to ask for without feeling guilty?',
      },
      {
        id: 'wnrs-12',
        type: 'open',
        tier: 'Connection',
        tierLevel: 2,
        prompt: 'When did you feel most seen by me?',
      },
      {
        id: 'wnrs-13',
        type: 'open',
        tier: 'Connection',
        tierLevel: 2,
        prompt: 'What feeling have you been carrying alone this week that you can hand to me tonight?',
      },
      {
        id: 'wnrs-14',
        type: 'multiple_choice',
        tier: 'Connection',
        tierLevel: 2,
        prompt: 'What makes you open up faster than anything else?',
        options: [
          'Knowing you will not judge or interrupt',
          'Late-night quiet without phones around',
          'Hearing you be vulnerable first',
          'Feeling physically close while talking',
        ],
      },
      {
        id: 'wnrs-15',
        type: 'open',
        tier: 'Connection',
        tierLevel: 2,
        prompt: 'What part of your childhood still shows up in how you love today?',
      },
      {
        id: 'wnrs-16',
        type: 'open',
        tier: 'Connection',
        tierLevel: 2,
        prompt: 'What question have you wanted to ask me for a while, but hesitated?',
      },
      {
        id: 'wnrs-17',
        type: 'open',
        tier: 'Connection',
        tierLevel: 2,
        prompt: 'When you imagine us growing older together, what scares you and what excites you?',
      },
      {
        id: 'wnrs-18',
        type: 'open',
        tier: 'Connection',
        tierLevel: 2,
        prompt: 'What is one thing I could stop doing, start doing, or keep doing to love you better?',
      },
      {
        id: 'wnrs-19',
        type: 'open',
        tier: 'Connection',
        tierLevel: 2,
        prompt: 'What unspoken promise do you feel exists between us?',
      },
      {
        id: 'wnrs-20',
        type: 'open',
        tier: 'Connection',
        tierLevel: 2,
        prompt: 'What does emotional safety look like to you in a concrete, everyday way?',
      },
      // Level 3: Reflection (10)
      {
        id: 'wnrs-21',
        type: 'open',
        tier: 'Reflection',
        tierLevel: 3,
        prompt: 'What have you learned about yourself just by being in this relationship with me?',
      },
      {
        id: 'wnrs-22',
        type: 'open',
        tier: 'Reflection',
        tierLevel: 3,
        prompt: 'How has the way you love me evolved since our very first month?',
      },
      {
        id: 'wnrs-23',
        type: 'open',
        tier: 'Reflection',
        tierLevel: 3,
        prompt: 'What quality of mine do you hope rubs off on you over time?',
      },
      {
        id: 'wnrs-24',
        type: 'open',
        tier: 'Reflection',
        tierLevel: 3,
        prompt: 'What difficult season taught us the most about how we work as a team?',
      },
      {
        id: 'wnrs-25',
        type: 'open',
        tier: 'Reflection',
        tierLevel: 3,
        prompt: 'If tonight ended up in a chapter of our story, what would the chapter title be?',
      },
      {
        id: 'wnrs-26',
        type: 'open',
        tier: 'Reflection',
        tierLevel: 3,
        prompt: 'What do you admire about the way I show up for the people I care about?',
      },
      {
        id: 'wnrs-27',
        type: 'open',
        tier: 'Reflection',
        tierLevel: 3,
        prompt: 'What is one thing you never want to take for granted about us?',
      },
      {
        id: 'wnrs-28',
        type: 'open',
        tier: 'Reflection',
        tierLevel: 3,
        prompt: 'How can I remind you on ordinary Tuesdays that you are deeply chosen?',
      },
      {
        id: 'wnrs-29',
        type: 'open',
        tier: 'Reflection',
        tierLevel: 3,
        prompt: 'Finish this sentence out loud: Because of you, I finally believe...',
      },
      {
        id: 'wnrs-30',
        type: 'open',
        tier: 'Reflection',
        tierLevel: 3,
        prompt: 'Tell your partner one honest thing you want them to remember tomorrow morning.',
      },
    ],
  },
  {
    id: '21-questions-hot-seat',
    indexNumber: '04',
    title: '21 Questions / Hot Seat',
    subtitle: '21 Cards · Rapid Hot Seat',
    descriptor: 'Answer without hesitating before passing the phone.',
    cardColor: '#556B2F',
    textColor: '#FFFFFF',
    mutedTextColor: 'rgba(255, 255, 255, 0.72)',
    pillColor: 'rgba(255, 255, 255, 0.16)',
    pillHoverColor: 'rgba(255, 255, 255, 0.24)',
    progressTrackColor: 'rgba(255, 255, 255, 0.28)',
    progressFillColor: '#FFFFFF',
    hasHotSeatTimer: true,
    cards: [
      { id: 'hs-01', type: 'open', kicker: 'Hot Seat · No Overthinking', prompt: 'What is your honest favorite physical feature of mine?' },
      { id: 'hs-02', type: 'open', kicker: 'Hot Seat', prompt: 'Did you stalk my social media before our first date? Be specific.' },
      { id: 'hs-03', type: 'open', kicker: 'Hot Seat', prompt: 'What outfit of mine makes you do a double take every time?' },
      { id: 'hs-04', type: 'open', kicker: 'Hot Seat', prompt: 'What was your exact thought right after our first kiss?' },
      { id: 'hs-05', type: 'open', kicker: 'Hot Seat', prompt: 'What is one tiny habit of mine you secretly tolerate?' },
      { id: 'hs-06', type: 'open', kicker: 'Hot Seat', prompt: 'Have you ever pretended to be asleep to avoid moving or getting up?' },
      { id: 'hs-07', type: 'open', kicker: 'Hot Seat', prompt: 'What is your weirdest 2 a.m. craving when we stay up together?' },
      { id: 'hs-08', type: 'open', kicker: 'Hot Seat', prompt: 'Which of my friends did you want to impress the most when you met them?' },
      { id: 'hs-09', type: 'open', kicker: 'Hot Seat', prompt: 'What is the boldest flirt move you ever pulled on me?' },
      { id: 'hs-10', type: 'open', kicker: 'Hot Seat', prompt: 'What is one secret green flag you noticed in me early on?' },
      { id: 'hs-11', type: 'open', kicker: 'Hot Seat', prompt: 'If we vanished for 48 hours with zero plans, where are we going?' },
      { id: 'hs-12', type: 'open', kicker: 'Hot Seat', prompt: 'What song makes you think of me immediately when it plays?' },
      { id: 'hs-13', type: 'open', kicker: 'Hot Seat', prompt: 'Have you ever rehearsed a text to me three times before sending it?' },
      { id: 'hs-14', type: 'open', kicker: 'Hot Seat', prompt: 'What is the funniest thing I do when I am hungry?' },
      { id: 'hs-15', type: 'open', kicker: 'Hot Seat', prompt: 'What do I say too often that you now catch yourself saying too?' },
      { id: 'hs-16', type: 'open', kicker: 'Hot Seat', prompt: 'Who was more nervous on our very first hangout?' },
      { id: 'hs-17', type: 'open', kicker: 'Hot Seat', prompt: 'What is one thing on your bucket list you only want to do with me?' },
      { id: 'hs-18', type: 'open', kicker: 'Hot Seat', prompt: 'What was the hardest secret surprise you kept from me?' },
      { id: 'hs-19', type: 'open', kicker: 'Hot Seat', prompt: 'What is my absolute worst movie or food take?' },
      { id: 'hs-20', type: 'open', kicker: 'Hot Seat', prompt: 'When did you last feel butterflies just looking at me?' },
      { id: 'hs-21', type: 'open', kicker: 'Final Hot Seat', prompt: 'Give me a three-word summary of how you feel about us tonight.' },
    ],
  },
  {
    id: 'date-night-roulette',
    indexNumber: '05',
    title: 'Date Night Roulette / Would You Rather',
    subtitle: '20 Cards · Playful Dilemmas',
    descriptor: 'Low-stakes dilemmas and date picks when neither of you can decide.',
    cardColor: '#B8D0E8',
    textColor: '#0F1924',
    mutedTextColor: 'rgba(15, 25, 36, 0.62)',
    pillColor: 'rgba(15, 25, 36, 0.09)',
    pillHoverColor: 'rgba(15, 25, 36, 0.16)',
    progressTrackColor: 'rgba(15, 25, 36, 0.18)',
    progressFillColor: '#0F1924',
    cards: [
      {
        id: 'dnr-01',
        type: 'dilemma',
        kicker: 'Would You Rather',
        prompt: 'Tonight: how are we spending the next three hours?',
        options: [
          'Stay in with takeout and a movie',
          'Spontaneous late-night drive with music',
        ],
      },
      {
        id: 'dnr-02',
        type: 'dilemma',
        kicker: 'Would You Rather',
        prompt: 'Pick our next shared weekend trip:',
        options: [
          'Cozy cabin with no cell reception',
          'Boutique city hotel with late room service',
        ],
      },
      {
        id: 'dnr-03',
        type: 'dilemma',
        kicker: 'Would You Rather',
        prompt: 'Dinner energy right now:',
        options: [
          'Cook a chaotic three-course meal together',
          'Dress up and walk into a random spot',
        ],
      },
      {
        id: 'dnr-04',
        type: 'dilemma',
        kicker: 'Would You Rather',
        prompt: 'Morning ritual choice:',
        options: [
          'Sleep in until noon with coffee in bed',
          'Catch sunrise together with bakery pastries',
        ],
      },
      {
        id: 'dnr-05',
        type: 'dilemma',
        kicker: 'Would You Rather',
        prompt: 'Which memory would you rather frame on our wall?',
        options: [
          'A candid blurred photo of us laughing',
          'A moody golden-hour portrait from a trip',
        ],
      },
      {
        id: 'dnr-06',
        type: 'dilemma',
        kicker: 'Date Roulette',
        prompt: 'Lose the coin toss, pick the next move:',
        options: [
          'Give your partner a 5-minute shoulder massage',
          'Let your partner control the aux for 48 hours',
        ],
      },
      {
        id: 'dnr-07',
        type: 'dilemma',
        kicker: 'Would You Rather',
        prompt: 'Rainy Sunday afternoon:',
        options: [
          'Bookstore browsing then warm soup',
          'Living room fort, vinyl or playlist, zero phones',
        ],
      },
      {
        id: 'dnr-08',
        type: 'dilemma',
        kicker: 'Would You Rather',
        prompt: 'Surprise date budget:',
        options: [
          'Ten-dollar convenience store picnic challenge',
          'Dressed to the nines at a quiet cocktail bar',
        ],
      },
      {
        id: 'dnr-09',
        type: 'dilemma',
        kicker: 'Would You Rather',
        prompt: 'Would you rather relive:',
        options: [
          'Our first kiss in slow motion',
          'The best trip we have taken so far',
        ],
      },
      {
        id: 'dnr-10',
        type: 'dilemma',
        kicker: 'Date Roulette',
        prompt: 'Right now challenge:',
        options: [
          'Trade phones and take one photo of each other',
          'Voice-record a 20-second note for future us',
        ],
      },
      {
        id: 'dnr-11',
        type: 'dilemma',
        kicker: 'Would You Rather',
        prompt: 'Pick one rule for our next date night:',
        options: [
          'Phones stay in airplane mode until midnight',
          'We must order everything for each other',
        ],
      },
      {
        id: 'dnr-12',
        type: 'dilemma',
        kicker: 'Would You Rather',
        prompt: 'Midnight snack showdown:',
        options: [
          'Pancakes and iced coffee at a 24-hour diner',
          'Ice cream straight from the pint on the couch',
        ],
      },
      {
        id: 'dnr-13',
        type: 'dilemma',
        kicker: 'Would You Rather',
        prompt: 'Double date or just us two?',
        options: [
          'Just us two tucked in a corner booth',
          'Chaotic game night with our favorite couple',
        ],
      },
      {
        id: 'dnr-14',
        type: 'dilemma',
        kicker: 'Would You Rather',
        prompt: 'Learn something together:',
        options: [
          'Pottery or pasta-making class',
          'Salsa or slow-dance lesson in the kitchen',
        ],
      },
      {
        id: 'dnr-15',
        type: 'dilemma',
        kicker: 'Date Roulette',
        prompt: 'Spontaneous spark:',
        options: [
          'Kiss for ten full seconds right now',
          'Tell each other your favorite thing about tonight',
        ],
      },
      {
        id: 'dnr-16',
        type: 'dilemma',
        kicker: 'Would You Rather',
        prompt: 'Cinema pick:',
        options: [
          'Rewatch a comfort movie we both quote',
          'Walk into a random film knowing zero plot',
        ],
      },
      {
        id: 'dnr-17',
        type: 'dilemma',
        kicker: 'Would You Rather',
        prompt: 'Who plans next Friday?',
        options: [
          'I plan every detail — you just show up',
          'You plan the whole night — no hints allowed',
        ],
      },
      {
        id: 'dnr-18',
        type: 'dilemma',
        kicker: 'Would You Rather',
        prompt: 'Long-haul flight together:',
        options: [
          'Share headphones and watch the same series',
          'Window lean nap and hold hands the whole way',
        ],
      },
      {
        id: 'dnr-19',
        type: 'dilemma',
        kicker: 'Would You Rather',
        prompt: 'Sunday reset vibe:',
        options: [
          'Farmers market walk + iced matcha',
          'Clean sheets, takeout, and zero alarms',
        ],
      },
      {
        id: 'dnr-20',
        type: 'dilemma',
        kicker: 'Final Roulette',
        prompt: 'Seal tonight with one move:',
        options: [
          'Lock in our next date night on the calendar right now',
          'Draw one card from Deep Conversations before bed',
        ],
      },
    ],
  },
];

export function getDeckById(id: string): GameDeck | undefined {
  return GAME_DECKS.find((d) => d.id === id);
}

export function findCardById(cardId: string): { deck: GameDeck; card: StoryCard; index: number } | undefined {
  for (const deck of GAME_DECKS) {
    const index = deck.cards.findIndex((c) => c.id === cardId);
    if (index !== -1) {
      return { deck, card: deck.cards[index], index };
    }
  }
  return undefined;
}
