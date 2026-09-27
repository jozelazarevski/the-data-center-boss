/* The Data Center Boss — static game data (equipment, clients, events, quiz, glossary). */
(function (root) {
  const DCB = (root.DCB = root.DCB || {});

  DCB.CONFIG = {
    maxW: 12,
    maxH: 8,
    startW: 8,
    startH: 5,
    startMoney: 120000,
    startRep: 30,
    startGrid: 120, // kW utility feed
    roomTemp: 20, // °C supply air when fully cooled
    powerPrice: 0.12, // $ per kWh
    dieselPrice: 0.35, // $ per kWh generated on diesel
    carbonGrid: 0.4, // kg CO2 per kWh
    carbonGreen: 0.05,
    techSalary: 280, // $ per technician per day
    rentPerTile: 10, // $ per floor tile per day
    lightsKw: 3, // offices, lights, security
    repairHours: 8,
    tempWarn: 27, // ASHRAE recommended upper inlet temperature
    tempThrottle: 32,
    tempCritical: 38,
    bankruptcy: -50000,
    winCash: 1000000,
  };

  // heat defaults to power. radius uses Chebyshev distance (a square around the unit).
  DCB.EQUIPMENT = {
    rack: {
      name: 'Server Rack', cat: 'compute', cost: 8000, power: 5, compute: 10,
      desc: 'A 42U rack of general-purpose servers. +10 compute.',
      lesson: 'A standard rack holds 42 "rack units" (1U = 1.75 inches). A typical enterprise rack draws 5–10 kW.',
    },
    dense: {
      name: 'High-Density Rack', cat: 'compute', cost: 22000, power: 12, compute: 35,
      desc: 'Blade servers packed tight. +35 compute, but runs hot (12 kW).',
      lesson: 'Blade chassis pack many servers into one enclosure sharing power and fans. More compute per tile, but much more heat per tile.',
    },
    gpu: {
      name: 'GPU AI Rack', cat: 'compute', cost: 70000, power: 35, compute: 140, requires: 'liquid',
      desc: 'Accelerators for AI training. +140 compute, 35 kW! Needs liquid cooling nearby.',
      lesson: 'Modern AI racks can draw 40–130 kW. Air simply cannot carry that much heat away, so they use direct-to-chip liquid cooling.',
    },
    storage: {
      name: 'Storage Array', cat: 'compute', cost: 10000, power: 3, storage: 200,
      desc: 'Disk shelves. +200 TB of storage.',
      lesson: 'Storage arrays combine many drives. Spinning disks (HDD) are cheap per TB; flash (SSD) is faster but pricier.',
    },
    crac: {
      name: 'CRAC Unit', cat: 'cooling', cost: 9000, power: 0, heat: 0, idle: 1, cooling: 40, radius: 2, cop: 2.5,
      desc: 'Computer Room Air Conditioner. Removes 40 kW of heat within 2 tiles. COP 2.5.',
      lesson: 'CRAC units blow cold air under a raised floor or into the room. COP (coefficient of performance) 2.5 means 1 kW of electricity removes 2.5 kW of heat.',
    },
    inrow: {
      name: 'In-Row Cooler', cat: 'cooling', cost: 16000, power: 0, heat: 0, idle: 0.5, cooling: 35, radius: 1, cop: 4,
      desc: 'Sits right between racks. 35 kW within 1 tile, efficient (COP 4).',
      lesson: 'Putting cooling next to the heat source means fans move air a shorter distance, which saves a lot of energy.',
    },
    cdu: {
      name: 'Liquid Cooling CDU', cat: 'cooling', cost: 40000, power: 0, heat: 0, idle: 1, cooling: 120, radius: 1, cop: 8, liquid: true, requires: 'liquid',
      desc: 'Coolant Distribution Unit. 120 kW within 1 tile, super efficient (COP 8).',
      lesson: 'Water carries about 3,500× more heat than the same volume of air. Liquid cooling is how AI data centers keep up.',
    },
    switch: {
      name: 'Network Switch', cat: 'network', cost: 6000, power: 1, bw: 40,
      desc: 'Top-of-rack switching and uplinks. +40 Gbps bandwidth.',
      lesson: 'Bandwidth is how much data per second you can move. 1 Gbps ≈ 125 MB per second.',
    },
    firewall: {
      name: 'Firewall', cat: 'network', cost: 14000, power: 1, security: 1,
      desc: 'Filters malicious traffic. Blocks ransomware and absorbs most DDoS traffic. Banks require one.',
      lesson: 'Firewalls inspect traffic and block anything that does not match the rules. Defense in depth means layering several protections.',
    },
    ups: {
      name: 'UPS', cat: 'power', cost: 15000, power: 1, heat: 1, ups: 150,
      desc: 'Uninterruptible Power Supply. Batteries bridge up to 150 kW through power blips.',
      lesson: 'A UPS switches to batteries in milliseconds, so servers never notice a power blip. Batteries only last minutes, long enough for generators to start.',
    },
    generator: {
      name: 'Diesel Generator', cat: 'power', cost: 28000, power: 0.5, heat: 0, gen: 250,
      desc: 'Backup generator. Carries up to 250 kW during long outages (fuel $0.35/kWh).',
      lesson: 'Generators take 10–15 seconds to start and stabilize. Without a UPS to cover that gap, the servers crash anyway.',
    },
  };

  DCB.heatOf = (d) => (d.heat !== undefined ? d.heat : d.power);

  DCB.CATEGORIES = [
    { id: 'compute', name: 'Compute & Storage' },
    { id: 'cooling', name: 'Cooling' },
    { id: 'power', name: 'Backup Power' },
    { id: 'network', name: 'Network & Security' },
  ];

  DCB.UPGRADES = {
    containment: {
      name: 'Hot/Cold Aisle Containment', cost: 25000, icon: '🧱',
      desc: 'All cooling units remove 25% more heat.',
      lesson: 'Racks face each other so cold air goes in the front and hot air leaves the back. Walls and doors keep hot and cold air from mixing, which makes cooling far more effective.',
    },
    virtualization: {
      name: 'Virtualization', cost: 35000, icon: '🧩',
      desc: 'Run many virtual machines per server: +30% compute from every rack.',
      lesson: 'Most physical servers sit idle much of the time. A hypervisor runs many virtual machines on one server, raising utilization from roughly 15% to over 60%.',
    },
    raid: {
      name: 'RAID & Backups', cost: 20000, icon: '💽',
      desc: 'Disk failures cause no data loss, and ransomware recovery is much faster.',
      lesson: 'RAID spreads data across several disks so one can die without losing data. The 3-2-1 rule: 3 copies, on 2 kinds of media, with 1 off-site.',
    },
    freeair: {
      name: 'Free-Air Economizer', cost: 30000, icon: '🌬️',
      desc: 'Uses cool outside air when it is cold out. Up to 60% less cooling power.',
      lesson: 'When it is cool outside, you can pull in filtered outdoor air instead of running compressors. That is why many data centers are built in cold climates.',
    },
    liquid: {
      name: 'Liquid Cooling Loop', cost: 60000, icon: '💧',
      desc: 'Plumbs chilled water to the floor. Unlocks Liquid CDUs and GPU AI Racks.',
      lesson: 'Direct-to-chip cooling pipes coolant through cold plates on top of CPUs and GPUs, taking heat straight from the source.',
    },
    dcim: {
      name: 'DCIM Monitoring', cost: 18000, icon: '📡',
      desc: 'Sensors everywhere. Equipment fails 40% less often (predictive maintenance).',
      lesson: 'Data Center Infrastructure Management software tracks power, temperature and health of every device, so you can fix problems before they cause outages.',
    },
    dualfiber: {
      name: 'Diverse Fiber Paths', cost: 22000, icon: '🛰️',
      desc: 'Two carriers entering from different sides of the building. Fiber cuts no longer take you offline.',
      lesson: 'Backhoes cut buried fiber surprisingly often. Having two carriers whose cables arrive by different routes is a classic redundancy practice.',
    },
    renewable: {
      name: 'Renewable Energy PPA', cost: 45000, icon: '☀️',
      desc: 'Buy wind and solar power at a fixed $0.13/kWh. Price spikes can no longer hurt you, and carbon drops 85%. Earns reputation.',
      lesson: 'A Power Purchase Agreement lets a company buy clean energy from a wind or solar farm at a locked-in price for 10–20 years.',
    },
  };

  // Client contract templates. sla is in percent.
  DCB.CLIENTS = [
    { id: 'bakery', name: "Rosie's Bakery Website", icon: '🥐', compute: 2, storage: 5, bw: 1, sla: 99, pay: 260, days: [20, 40], minRep: 0 },
    { id: 'blog', name: 'Retro Gaming Blog', icon: '👾', compute: 3, storage: 10, bw: 3, sla: 99, pay: 380, days: [20, 40], minRep: 0 },
    { id: 'school', name: 'School District Portal', icon: '🏫', compute: 6, storage: 25, bw: 4, sla: 99.5, pay: 750, days: [30, 60], minRep: 15 },
    { id: 'indie', name: 'Indie Game Studio', icon: '🎮', compute: 10, storage: 20, bw: 6, sla: 99.5, pay: 1150, days: [20, 45], minRep: 20 },
    { id: 'shop', name: 'Online Sneaker Store', icon: '👟', compute: 14, storage: 30, bw: 8, sla: 99.9, pay: 1800, days: [30, 60], minRep: 30 },
    { id: 'uni', name: 'University Research Lab', icon: '🎓', compute: 30, storage: 120, bw: 4, sla: 99, pay: 2600, days: [30, 60], minRep: 30 },
    { id: 'stream', name: 'Video Streaming Service', icon: '🎬', compute: 25, storage: 400, bw: 60, sla: 99.9, pay: 4600, days: [30, 60], minRep: 45 },
    { id: 'hospital', name: 'Hospital Health Records', icon: '🏥', compute: 12, storage: 150, bw: 4, sla: 99.99, pay: 3600, days: [30, 60], minRep: 50, needs: 'firewall' },
    { id: 'social', name: 'Social Media App', icon: '📱', compute: 60, storage: 250, bw: 50, sla: 99.9, pay: 8200, days: [30, 60], minRep: 55 },
    { id: 'bank', name: 'National Bank', icon: '🏦', compute: 40, storage: 80, bw: 8, sla: 99.99, pay: 8000, days: [40, 80], minRep: 60, needs: 'firewall' },
    { id: 'ai', name: 'Frontier AI Lab', icon: '🤖', compute: 260, storage: 300, bw: 20, sla: 99.9, pay: 36000, days: [30, 60], minRep: 65 },
    { id: 'gov', name: 'Government Agency', icon: '🏛️', compute: 50, storage: 200, bw: 10, sla: 99.99, pay: 11000, days: [60, 90], minRep: 75, needs: 'firewall' },
  ];

  DCB.EVENTS = {
    outage: {
      title: 'Utility Power Outage!', icon: '⚡', weight: 10,
      text: 'A storm knocked out the power grid in your area. The lights just flickered…',
      lesson: 'Real data centers survive outages with a chain: UPS batteries take over instantly, then diesel generators start within seconds and run until the grid comes back.',
    },
    squirrel: {
      title: 'Squirrel Attack!', icon: '🐿️', weight: 5,
      text: 'A squirrel chewed through a cable at the local substation. Power is out.',
      lesson: 'This really happens! Squirrels and other animals cause a surprising share of power outages in the US every year.',
    },
    heatwave: {
      title: 'Heat Wave', icon: '🌡️', weight: 7,
      text: 'Outside temperatures are soaring for the next two days. Your chillers are working harder and cooling less.',
      lesson: 'Cooling equipment rejects heat to the outside air. The hotter it is outside, the harder (and less efficiently) it has to work.',
    },
    ddos: {
      title: 'DDoS Attack!', icon: '🌊', weight: 7,
      text: 'A botnet is flooding one of your clients with junk traffic, eating your bandwidth.',
      lesson: 'A Distributed Denial of Service attack uses thousands of hijacked devices to flood a target. Spare bandwidth and filtering (firewalls, scrubbing services) are the defense.',
    },
    fiber: {
      title: 'Fiber Cut!', icon: '🚜', weight: 5,
      text: 'A construction crew dug straight through your fiber-optic line.',
      lesson: 'Network engineers joke that the biggest threat to the internet is the backhoe. Diverse paths from different carriers are the fix.',
    },
    disk: {
      title: 'Disk Failure', icon: '💥', weight: 7,
      text: 'A hard drive in one of your storage arrays just died with a loud click.',
      lesson: 'Drives fail all the time. At scale, around 1–2% of hard drives die each year. RAID and backups turn a disaster into a routine swap.',
    },
    ransomware: {
      title: 'Ransomware Attempt', icon: '🦠', weight: 4,
      text: 'A phishing email tricked an employee, and ransomware is trying to encrypt your systems!',
      lesson: 'Ransomware encrypts files and demands payment. Good backups mean you can restore instead of paying, and firewalls stop many attacks at the door.',
    },
    spike: {
      title: 'Viral Traffic Spike!', icon: '🚀', weight: 6,
      text: 'One of your clients went viral! Demand for compute is up 40% for the next 12 hours.',
      lesson: 'Traffic can spike suddenly. Keeping spare capacity ("headroom") or being able to scale quickly is what lets services stay up during their big moment.',
    },
    pricespike: {
      title: 'Energy Price Spike', icon: '💸', weight: 5,
      text: 'Wholesale electricity prices tripled for the next 3 days.',
      lesson: 'Electricity is often the largest operating cost of a data center. Efficiency (low PUE) and fixed-price contracts protect you.',
    },
    cosmic: {
      title: 'Cosmic Ray Bit Flip', icon: '☄️', weight: 3,
      text: 'A high-energy particle from space flipped a bit in a server’s memory. ECC memory detected and fixed it.',
      lesson: 'Cosmic rays really do flip bits in RAM. ECC (Error-Correcting Code) memory detects and repairs single-bit errors, which is why servers use it.',
    },
    sale: {
      title: 'Vendor Flash Sale', icon: '🏷️', weight: 4,
      text: 'Your hardware vendor is clearing inventory: 25% off all equipment for the next 24 hours!',
      lesson: 'Hardware often gets a "refresh" every 3–5 years, since newer chips do much more work per watt.',
    },
    journalist: {
      title: 'Journalist Wants a Tour', icon: '📰', weight: 3,
      text: 'A tech journalist wants to write about your data center. Letting them in is good publicity, but they will write about what they see.',
      lesson: 'Real data centers have strict physical security: badges, mantraps, biometric scanners and cameras. Visitors are always escorted.',
      choices: ['Give the tour', 'Politely decline'],
    },
    crypto: {
      title: 'Crypto Miner Offer', icon: '⛏️', weight: 3,
      text: 'A crypto-mining company offers $15,000 cash right now to use your spare power for a week. It will cost reputation with environmentally conscious clients.',
      lesson: 'Proof-of-work mining uses huge amounts of electricity. Bitcoin mining alone uses about as much power as a mid-sized country.',
      choices: ['Take the money', 'No thanks'],
    },
  };

  DCB.QUIZ = [
    { q: 'What does PUE stand for?', a: ['Power Usage Effectiveness', 'Peak Utility Energy', 'Processor Utilization Efficiency', 'Power Unit Exchange'], c: 0,
      e: 'PUE = total facility power ÷ IT equipment power. A perfect score is 1.0; the industry average is about 1.5.' },
    { q: 'A data center uses 150 kW total, and its servers use 100 kW. What is its PUE?', a: ['0.67', '1.5', '2.5', '50'], c: 1,
      e: '150 ÷ 100 = 1.5. So 50 kW goes to cooling, lights and power losses.' },
    { q: 'Roughly how much downtime per year does "four nines" (99.99%) uptime allow?', a: ['About 52 minutes', 'About 9 hours', 'About 3.6 days', 'Zero'], c: 0,
      e: '99.99% of a year is 52.6 minutes of downtime. 99.9% allows ~8.8 hours; 99.999% ("five nines") only ~5 minutes!' },
    { q: 'Where does almost all the electricity used by a server end up?', a: ['Stored in the hard drives', 'As heat', 'Sent over the network', 'Back in the power grid'], c: 1,
      e: 'Nearly every watt a server consumes becomes heat. That is why cooling is such a huge job.' },
    { q: 'What is the main job of a UPS?', a: ['Deliver packages', 'Bridge power instantly until generators start', 'Cool the servers', 'Speed up the network'], c: 1,
      e: 'An Uninterruptible Power Supply keeps power flowing on batteries for the seconds or minutes before generators take over.' },
    { q: 'What does "N+1" redundancy mean?', a: ['One more unit than you need', 'Only one unit total', 'Double everything', 'Each server has one fan'], c: 0,
      e: 'If you need N cooling units, you install N+1 so any single one can fail (or be serviced) without problems.' },
    { q: 'What inlet air temperature range does ASHRAE recommend for servers?', a: ['0–10 °C', '18–27 °C', '30–40 °C', '45–55 °C'], c: 1,
      e: 'ASHRAE recommends 18–27 °C (64–81 °F). Running warmer within that range saves cooling energy.' },
    { q: 'In hot/cold aisle containment, where do racks pull air in?', a: ['From the hot aisle', 'From the cold aisle', 'From the ceiling only', 'From outside'], c: 1,
      e: 'Racks take in cold air from the front (cold aisle) and exhaust hot air out the back (hot aisle).' },
    { q: 'What does RAID help protect against?', a: ['Bugs in code', 'Losing data when a disk fails', 'Power outages', 'Hackers'], c: 1,
      e: 'RAID stores data (or parity) across multiple drives so a single failure does not lose data. It is NOT a backup, though!' },
    { q: 'Why is liquid cooling used for AI racks?', a: ['It looks cool', 'Water carries far more heat than air', 'It makes GPUs faster by magic', 'Air is too expensive'], c: 1,
      e: 'Water has a far higher heat capacity than air, so it can pull away the 40+ kW that dense AI racks produce.' },
    { q: 'What is the 3-2-1 backup rule?', a: ['3 servers, 2 racks, 1 room', '3 copies, 2 media types, 1 off-site', '3 passwords, 2 users, 1 admin', 'Back up every 3 days, 2 times, for 1 hour'], c: 1,
      e: 'Keep 3 copies of data, on 2 different kinds of storage, with 1 copy somewhere else.' },
    { q: 'What does a DDoS attack try to do?', a: ['Steal passwords', 'Overwhelm a service with traffic', 'Encrypt files', 'Overheat the servers'], c: 1,
      e: 'Distributed Denial of Service floods a target with traffic from many machines so real users cannot get through.' },
    { q: 'How many inches tall is one rack unit (1U)?', a: ['1 inch', '1.75 inches', '3 inches', '12 inches'], c: 1,
      e: '1U = 1.75 in (44.45 mm). A standard full-height rack is 42U.' },
    { q: 'What is "free cooling"?', a: ['Cooling paid for by the government', 'Using cold outside air or water instead of compressors', 'Turning the servers off', 'Opening the windows in summer'], c: 1,
      e: 'Economizers use cool outside air or water when conditions allow, saving a lot of energy.' },
    { q: 'What does "latency" measure?', a: ['How much data fits in a cable', 'The delay for data to travel', 'The number of servers', 'The price of electricity'], c: 1,
      e: 'Latency is delay, usually in milliseconds. Light in fiber travels about 200 km per millisecond, so distance matters!' },
    { q: 'Which data center "Tier" is the most fault tolerant?', a: ['Tier I', 'Tier II', 'Tier III', 'Tier IV'], c: 3,
      e: 'Uptime Institute Tier IV means fully fault-tolerant, with 2N redundant power and cooling paths. Tier I has no redundancy.' },
    { q: 'What does virtualization let you do?', a: ['Run many virtual machines on one physical server', 'Make servers invisible', 'Play VR games', 'Download more RAM'], c: 0,
      e: 'A hypervisor splits one physical server into many isolated virtual machines, raising utilization.' },
    { q: 'What is a hyperscaler?', a: ['A very tall server rack', 'A company running cloud infrastructure at massive scale', 'A fast network switch', 'A type of cooling tower'], c: 1,
      e: 'Hyperscalers such as the big cloud providers run hundreds of data centers with millions of servers.' },
    { q: 'Which usually costs a data center the most to run over its lifetime?', a: ['Electricity', 'Paint', 'Parking', 'Coffee'], c: 0,
      e: 'Energy is the largest operating cost for most data centers, which is why efficiency matters so much.' },
    { q: 'What does ECC memory do?', a: ['Encrypts cloud computing', 'Detects and corrects memory bit errors', 'Makes RAM faster', 'Cools the CPU'], c: 1,
      e: 'Error-Correcting Code memory adds extra bits to find and fix single-bit errors, such as those caused by cosmic rays.' },
  ];

  DCB.GLOSSARY = [
    ['PUE', 'Power Usage Effectiveness = total facility power ÷ IT power. 1.0 is perfect. The global average is ~1.5; the best hyperscale sites reach ~1.1.'],
    ['IT Load', 'Power used by the servers, storage and network gear themselves. That is the "useful" part.'],
    ['kW / kWh', 'kW is power (how fast energy is used). kWh is energy: 1 kW for 1 hour = 1 kWh.'],
    ['Uptime & "Nines"', '99% = 3.65 days of downtime a year. 99.9% = 8.8 hours. 99.99% = 52 minutes. 99.999% = 5 minutes.'],
    ['SLA', 'Service Level Agreement: your promise to a client, like "99.9% uptime". Miss it and you owe service credits.'],
    ['UPS', 'Uninterruptible Power Supply. Batteries that take over instantly when grid power fails.'],
    ['Generator', 'Diesel engines that provide power during long outages. They take seconds to start, which is why you need a UPS as well.'],
    ['CRAC / CRAH', 'Computer Room Air Conditioner / Air Handler. The big cooling units in a server room.'],
    ['COP', 'Coefficient of Performance: heat removed ÷ electricity used. Higher is more efficient.'],
    ['Hot/Cold Aisle', 'Racks line up so fronts face fronts (cold aisle) and backs face backs (hot aisle). Containment stops the air mixing.'],
    ['ASHRAE Range', 'Recommended server inlet temperature: 18–27 °C. Hotter risks throttling and failures.'],
    ['Throttling', 'Chips slow themselves down when too hot to avoid damage. You lose performance.'],
    ['N+1 / 2N', 'N+1: one spare unit beyond what you need. 2N: a complete duplicate of everything.'],
    ['Tier I–IV', 'Uptime Institute ratings. Tier I = basic, Tier IV = fully fault-tolerant.'],
    ['Bandwidth', 'Maximum data per second over a link, e.g. 10 Gbps.'],
    ['Latency', 'Delay for data to travel. Physics limit: ~5 µs per km in fiber.'],
    ['RAID', 'Redundant Array of Independent Disks. Survives disk failures. It is not a backup!'],
    ['Virtualization', 'Running many virtual machines on one physical server using a hypervisor.'],
    ['DDoS', 'Distributed Denial of Service: flooding a target with traffic from many machines.'],
    ['Free Cooling', 'Using cold outside air or water instead of mechanical chillers.'],
    ['Liquid Cooling', 'Coolant piped to cold plates on chips, or servers immersed in fluid. Needed for dense AI racks.'],
    ['DCIM', 'Data Center Infrastructure Management: monitoring software for power, cooling and assets.'],
    ['Colocation', 'Renting space, power and cooling in someone else’s data center for your servers.'],
    ['Carbon Footprint', 'CO₂ emitted to make your electricity. Cleaner energy and a lower PUE both shrink it.'],
  ];

  // Goals are checked in sim.js; order = career progression.
  DCB.GOALS = [
    { id: 'first_rack', title: 'Rack ’em up', desc: 'Build your first Server Rack.', reward: 0 },
    { id: 'cooled', title: 'Keep it cool', desc: 'Have a working rack below 27 °C (the ASHRAE upper limit).', reward: 2000 },
    { id: 'first_client', title: 'Open for business', desc: 'Sign your first client contract.', reward: 3000 },
    { id: 'backup', title: 'Belt and braces', desc: 'Own both a UPS and a Diesel Generator.', reward: 5000 },
    { id: 'five_clients', title: 'Growing colo', desc: 'Have 5 active clients at once.', reward: 10000 },
    { id: 'pue15', title: 'Efficiency expert', desc: 'Reach PUE below 1.50 with at least 30 kW IT load.', reward: 15000 },
    { id: 'rev100k', title: 'Six figures', desc: 'Earn $100,000 in total revenue.', reward: 10000 },
    { id: 'survive', title: 'Lights stayed on', desc: 'Get through a power outage with zero downtime.', reward: 20000 },
    { id: 'four_nines', title: 'Four nines', desc: 'Complete a 99.99% SLA contract without breaching it.', reward: 30000 },
    { id: 'pue125', title: 'Hyperscale efficiency', desc: 'Reach PUE below 1.25 with at least 100 kW IT load.', reward: 40000 },
    { id: 'ai_host', title: 'AI factory', desc: 'Host a Frontier AI Lab.', reward: 50000 },
    { id: 'millionaire', title: 'Hyperscaler', desc: 'Reach $1,000,000 in cash. You win!', reward: 0 },
  ];

  DCB.RANKS = [
    'Junior Server Wrangler',
    'Server Room Supervisor',
    'Colo Manager',
    'Operations Director',
    'Data Center Boss',
    'Cloud Tycoon',
    'Hyperscale Legend',
  ];

  DCB.FACTS = [
    'Data centers use roughly 1–2% of all electricity in the world.',
    'Google reports a fleet-wide PUE of about 1.10.',
    'Some data centers are cooled with seawater, and Microsoft once tested one on the sea floor!',
    'The first "computer bug" was a real moth found in a relay of the Harvard Mark II in 1947.',
    'Light in optical fiber travels about 200,000 km per second, about 2/3 the speed of light in a vacuum.',
    'Undersea cables carry about 99% of intercontinental internet traffic.',
    'Some data centers pipe their waste heat into nearby homes and swimming pools.',
    'Hard drives are so sensitive that shouting at them can measurably slow them down.',
    'A single AI training cluster can draw more power than a small town.',
    'Data centers in Nordic countries use cold climates for nearly free cooling most of the year.',
    'Raised floors in older data centers were used to route cold air and cables underneath the racks.',
    'Many data centers keep enough diesel on site to run their generators for 24–48 hours.',
    'A 42U rack is a little over 2 meters tall.',
    'Server fans can spin at more than 15,000 RPM.',
  ];
})(typeof window !== 'undefined' ? window : globalThis);
