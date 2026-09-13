# College Timetable

A black, minimal weekly timetable planner for college classes. Add your subjects, time slots and rooms, then click any cell to schedule a class.

**Live demo:** https://college-timetable-vjxeyy.vercel.app

> **Built entirely by vibe coding with Claude.**
> I described what I wanted in plain English, and Claude (in Claude Code) wrote every line of the HTML, CSS and JavaScript. No code in this project was written by hand.

---

## Features

- Subjects with a course code, faculty name and a colour
- Time slots for periods and breaks. Breaks like Lunch span the whole row, the next slot is pre-filled for you, and overlapping slots are rejected
- Rooms with a type (classroom, lab, seminar hall) and capacity, plus how many classes each room has per week
- Weekly grid from Monday to Saturday. Click a cell to add or edit a class, and today's column is highlighted
- Saves automatically in your browser, with no account or server needed
- Load sample, Print (prints a clean light version) and Reset all
- Works on phones, not just desktops
- Vercel Web Analytics to count visitors

## How it was built

This project was made by vibe coding: I gave Claude instructions and feedback, and it did all the coding.

1. Asked Claude for a simple, responsive college timetable app in HTML, CSS and JavaScript
2. Asked for a black, simple and aesthetic UI
3. Tried an all-monochrome version, then went back to the soft-colour style I liked better
4. Claude tested the app in a browser and fixed the bugs it found, such as the edit dialog closing by accident and the Escape key not closing it
5. Deployed it on Vercel and uploaded it to GitHub
6. Added Vercel Web Analytics

## Tech stack

- HTML, CSS and plain JavaScript
- No frameworks and no build step
- Hosted on Vercel

## Project structure

```
college-timetable/
├── index.html                     # Page layout: header, sidebar tabs, weekly grid, edit dialog
├── css/
│   └── style.css                  # Black theme, responsive layout, print styles
├── js/
│   ├── storage.js                 # Saves and loads data in the browser (localStorage)
│   └── app.js                     # Forms, validation, timetable rendering and events
└── college-timetable-single.html  # The whole app in one file
```
