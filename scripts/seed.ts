import { db } from '../lib/db'
import { customers, users } from '../lib/db/schema'
import { sql } from 'drizzle-orm'

// ─── Customers ────────────────────────────────────────────────────────────────

const CUSTOMERS: {
  name: string
  email?: string
  address?: string
  notes?: string
  isPrepaid?: boolean
}[] = [
  {
    name: 'Andrew Johnson',
    address: '4079 Highwood Rd',
    notes: 'KISS. Dude is super chill.',
  },
  {
    name: 'Ann Ryan',
    address: '105 Clay Cliffe Drive, Tonka Bay Minnesota 55331',
    notes: 'Do not powerwash or scrub carpet on pontoon. Make sure to clean inside toilet bowl and on seat. Water pressure is not enough to powerwash, so avoid powerwashing when you can. Gate code: *1776.',
  },
  {
    name: 'Bill Raisbeck',
    address: '2405 Beach Ln Wayzata, MN 55391',
    notes: 'Formula 370 SS - Standard Clean Bi-Weekly, Under Seat Edges + Sinks, Carpet Pull Out + Rinse, + Cabin Clean; Malibu 23\' - Standard Clean Bi-Weekly, Under Seat Edges; No edgewater.',
  },
  {
    name: 'Bill Rouse',
    address: 'Upper Minnetonka Yacht Club Spring Park',
    notes: 'Keep it simple stupid. Currently no access to electricity for vacuum. Located on docks behind Upper Minnetonka Yacht Club, far right. Lift up carpets and clean underneath.',
    isPrepaid: true,
  },
  {
    name: 'Brandon Melz',
    address: '3131 Casco Cir Wayzata',
    notes: 'CRITICAL INFORMATION: Do not clean the screens, helm, steering wheel with anything but a dry microfiber. NO SPRAY. AND CLEAN THE ROOF PLEASE!',
  },
  {
    name: 'Christian Paese',
    address: 'MYC Marina',
    notes: 'Black boat on floating docks. Very clean boat KISS.',
  },
  {
    name: 'Christina Bonner',
    address: '4774 Kildare Rd Mound MN 55364',
    notes: 'KISS.',
  },
  {
    name: 'Christine Lindblad',
    address: '90 Interlachen Ln, Excelsior, MN 55331',
    notes: 'KISS.',
  },
  {
    name: 'Christine Rotsch',
    notes: 'Required steps when arriving: ring doorbell, request lift lowered, drive down and park in lower lot. Bimini cover must always be wiped down. Unsnap edges of carpet and make sure they get cleaned.',
  },
  {
    name: 'Colleen Ryan',
    address: '19785 Lakeview Ave Excelsior, MN 55331',
    notes: 'Keep it simple stupid.',
  },
  {
    name: 'Dan Gladney',
    notes: 'Tanager Lake at North Shore Marina. Dock T29.',
  },
  {
    name: 'Dave Bergland',
    address: 'Caribbean Marina',
    notes: 'Work efficiently. 35\'.',
  },
  {
    name: 'Doug Drier',
    address: '20980 Channel Dr Greenwood MN 55331',
    notes: 'KISS. Dude is super chill. Small boat in back-driveway is kinda weird, park on street or at top on right side.',
  },
  {
    name: 'Fonda Broekhuis',
    address: '5040 Enchanted Rd, Mound, MN 55364',
    notes: 'KISS.',
  },
  {
    name: 'Galen Johnson',
    address: '85 Clay Cliffe Drive',
    notes: 'Gate Code *1776.',
  },
  {
    name: 'George Sayer',
    address: 'Howards Point Marina',
    notes: 'Make sure to focus and do good work.',
  },
  {
    name: 'Hayley Stoen',
    address: '2109 Lake Rd, Wayzata MN 55391',
    notes: 'Ants in boat, do your best. No water or electricity, manual clean, you got it!',
  },
  {
    name: 'Jay Moore',
    address: '4890 Meadville St, Greenwood, MN 55331',
    notes: 'Focus on edges.',
  },
  {
    name: 'Jed Otteson',
    address: 'Howards Point Marina',
    notes: 'KISS.',
  },
  {
    name: 'Jeff Klein',
    address: '6442 Smithtown Rd',
    notes: 'Boat soap only.',
  },
  {
    name: 'Jeff Stone',
    notes: 'KISS.',
  },
  {
    name: 'Jeff Wigen',
    notes: 'There are two different gates, each with lockboxes and codes. The first lockbox is left of the gate on garage, the second lockbox is right attached to the gate. KEEP THE FIRST GATE OPEN as it will lock behind you. The second gate can close and put the key back. The code for lockboxes and white lift boxes is 0811. Make sure to confirm which boats you are cleaning. There are cameras as well.',
  },
  {
    name: 'Jenna Nichols',
    email: 'nichols.lee.jenna@gmail.com',
    notes: 'KISS.',
  },
  {
    name: 'Jenni Steingas',
    address: '970 Iris Circle, Excelsior MN',
    notes: 'KISS.',
  },
  {
    name: 'Jill Miller',
    address: '1600 Bohns Point Rd, Orono MN 55391',
    notes: 'Do not use powerwasher on lund interior. Take ample time on edges in Sea-Ray.',
  },
  {
    name: 'Jim Wilson',
    address: '4372 West Arm Road',
    notes: 'Focus on small cracks/corners. Personal war against webs/spiders. Make chrome look good (wants boat to shine). Zero spots should be on exterior. Less concerned with the actual cabin area. Clean the rooftop. Take (blue) railing covers and back covers off and just leave inside boat. Clean the white mats that surround the back. Boat is a big wooden Chris Craft. IMPORTANT: VACUUM NEEDED, takes 2.5-3hrs. VACUUM ENTIRE BOAT and clean sides with brush. LOTS OF SPIDERS.',
  },
  {
    name: 'Joe Ryan',
    address: '20350 Lakeview Ave Excelsior, MN 55331',
    notes: '350: CLEAN THE ROOF EACH TIME, NO QUESTIONS. Garage Code: 1234. Focus on flooring, dash and windows. Malibu: keep it simple stupid. Lund: Work on carpet.',
  },
  {
    name: 'John Gardiner',
    address: '19895 Cottagewood Ave Excelsior, MN 55331',
    notes: 'Focus on flooring and streaking on windows.',
  },
  {
    name: 'Jon Monson',
    notes: 'KISS.',
  },
  {
    name: 'Jon Schwartzman',
    address: '135 Lakeview Ave, Minnetrista, MN 55331',
    notes: 'KISS.',
  },
  {
    name: 'Joshua Karlgaard',
    address: '23500 Smithtown Rd, Shorewood, MN 55331',
    notes: 'Only clean exterior down to rubrail, remove all carpet and clean underneath.',
  },
  {
    name: 'Kate Grussing',
    address: '16167 Crosby Cove Rd Wayzata 55391',
    notes: 'KISS.',
  },
  {
    name: 'Keith Banks',
    notes: 'KISS.',
  },
  {
    name: 'Kelly Lampe',
    address: '6574 Smithtown Rd Excelsior, MN 55331',
    notes: 'KISS. Make sure to clean inside as well. NOT EXTERIOR ONLY.',
  },
  {
    name: 'Kim Shiely',
    address: '4495 Enchanted Lane Shorewood MN 55364',
    notes: 'KISS.',
  },
  {
    name: 'Laura Ekholm',
    address: '2606 W Lafayette Rd, Excelsior 55331',
    notes: 'Skiffcraft & Sea-Ray: Grab keys out of outdoor granite table drawer in the backyard, use manual keyhole for monterey lift, do not use the remote. Sea-Ray: Windows are tough, do your best. Make sure to open all hatches - bathroom, storage hatch on the back, where winch is stored in front - edges around hatches are really dirty.',
  },
  {
    name: 'Laurie Larson',
    address: '5220 Meadville Street Excelsior Minnesota 55331',
    notes: 'Don\'t throw away the empty can. Lady is super chill.',
  },
  {
    name: 'Mark Sigel',
    notes: 'KISS.',
  },
  {
    name: 'Mary Kay Klein',
    address: '6574 Smithtown Rd Excelsior, MN 55331',
    notes: 'On Formula, focus on streaking on outside and windows, use dry microfiber cloth. No cleaning the cabin area of formula. On Cobalt, make sure no water spots. IMPORTANT: Make sure to only clean the formula unless Kelly Lampe is also listed as a boat for the day - in which case clean both.',
  },
  {
    name: 'Matt Carle',
    address: '20350 Lakeview Ave Excelsior, MN 55331',
    notes: 'Sundancer: Outside is tricky on bottom, don\'t spend too much time on it. If cabin is unlocked - clean it.',
  },
  {
    name: 'Mike Monson',
    address: 'Excelsior Commons',
    notes: 'Do underseat cushions, down to waterline on exterior. Pier 2 - Code 5532.',
  },
  {
    name: 'Mike Reger',
    notes: 'Be professional, don\'t look around and do good work.',
  },
  {
    name: 'Molly Rotsch',
    notes: 'KISS.',
  },
  {
    name: 'Mr. Blanks',
    address: 'Howards Point Marina',
    notes: 'Black paint on bottom is very tough, go down as far as you can without getting too messy. Boat is located in dry storage area on gravel road all the way back. Water pump is close by.',
  },
  {
    name: 'Mr. Bricker',
    notes: 'KISS.',
  },
  {
    name: 'Patrick Stolz',
    address: '21230 Excelsior Blvd, Excelsior, MN 55331',
    notes: 'KISS.',
  },
  {
    name: 'Pete Hanson',
    notes: 'KISS.',
  },
  {
    name: 'Peter Stenehjem',
    notes: 'KISS.',
  },
  {
    name: 'Rosalind Zils',
    address: 'Carsons Bay Facility',
    notes: 'Clean inside all storage areas. Located on main floating docks, second furthest right boat when looking out at lake. Blue hull. Parking is tricky, use minimal amount of cars and park in McDonald\'s parking lot.',
  },
  {
    name: 'Russel Lindquist',
    email: 'r.lindquist@mchsi.com',
    address: '5985 Loring Drive, Minnetrista, MN 55364',
    notes: 'KISS.',
  },
  {
    name: 'Scott Bartlett',
    address: '10 Bay St Excelsior, MN 55331',
    notes: 'KISS.',
  },
  {
    name: 'Stephanie Bredaly',
    email: 'Bredalys@gmail.com',
    address: '603 Glencoe Road, Excelsior, MN',
    notes: 'KISS.',
  },
  {
    name: 'Suresh Krishna',
    address: '105 Mound Ave, Excelsior, MN 55331',
    notes: 'KISS.',
  },
  {
    name: 'Talia Pierce',
    notes: 'KISS.',
  },
  {
    name: 'The McMillan Family',
    address: '20350 Lakeview Ave Excelsior, MN 55331',
    notes: 'NEW BOAT (Formula): Be careful and don\'t overdo it with the powerwasher. On Malibu, make sure to get particles out of the carpet. IMPORTANT: Coil ropes, fold towels, empty trash - make it look tidy.',
  },
  {
    name: 'The Zils Family',
    address: 'MYC Marina',
    notes: 'Blue boat 22\'.',
  },
  {
    name: 'Tim Regan',
    notes: 'KISS.',
  },
  {
    name: 'Todd Jackson',
    address: '365 Lakeview Ave, Excelsior, MN 55331',
    notes: 'KISS.',
  },
  {
    name: 'Tom Emmel',
    address: '3138 Northview Rd, Wayzata',
    notes: 'KISS.',
  },
  {
    name: 'Turang Behbahani',
    address: 'Dock D-34 at Bayside Marine',
    notes: 'KISS.',
  },
  {
    name: 'Zach Quinn',
    address: 'T and T Boat Works',
    notes: 'KISS.',
  },
]

// ─── Employees ────────────────────────────────────────────────────────────────

const EMPLOYEES: { email: string; displayName: string; role: 'owner' | 'manager' | 'employee' }[] = [
  { email: 'marley@squeakycleanboats.com', displayName: 'Marley Barrett', role: 'owner' },
  { email: 'jd@squeakycleanboats.com', displayName: 'JD Landstrom', role: 'employee' },
  { email: 'nate@squeakycleanboats.com', displayName: 'Nate Bongard', role: 'employee' },
  { email: 'miles@squeakycleanboats.com', displayName: 'Miles Humphrey', role: 'employee' },
]

// ─── Run ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Seeding ${CUSTOMERS.length} customers...`)

  for (const c of CUSTOMERS) {
    await db
      .insert(customers)
      .values({
        name: c.name,
        email: c.email ?? null,
        address: c.address ?? null,
        notes: c.notes ?? null,
        isPrepaid: c.isPrepaid ?? false,
      })
      .onConflictDoNothing()
  }

  console.log(`Seeding ${EMPLOYEES.length} employees...`)

  for (const e of EMPLOYEES) {
    await db
      .insert(users)
      .values(e)
      .onConflictDoUpdate({
        target: users.email,
        set: { displayName: e.displayName, role: e.role },
      })
  }

  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(customers)
  console.log(`Done. ${count} total customers in DB.`)

  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
