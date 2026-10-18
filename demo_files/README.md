# Demo files

Use these with **Pick a file** in the simulator, or print them and use **Open camera**.

| File | Use it in | What should happen |
|---|---|---|
| `page_story.jpg` | Read Aloud, Read to Me, Make a Test, Home Language | The page text is read off the photo |
| `page_science.jpg` | Make a Test, Oral Exam ("Ask about today's page") | Questions about lightning and thunder |
| `answer_sheet_1_rafi.jpg` … `answer_sheet_4_ayesha.jpg` | Grade Answers (select all four at once) | Rafi and Ayesha score high, Mina and Tanvir low; **Check for copying** flags Mina + Tanvir (same "becaus", "travle", same wrong idea) |
| `math_sheet_joy.jpg` | Grade Answers with **Maths: find the wrong step** on | Question: "A shop has 52 mangoes. It sells 27. How many are left?" Model answer: "52 − 27 = 25". The first wrong step is "2 − 7 = 5" (should borrow) |

For the answer sheets, the default question and model answer in Grade Answers already match.

## Reading script for Read Aloud

Tap **Mina** as the start word, then read this aloud. The mistakes are deliberate:

> Mina wanted to see the river after the rain. She **walk** past the tall mango tree and the old school gate. The water was brown ~~and~~ fast. A small boat was **tide** to a post, and a white bird stood on it.

Expected result: "walked" and "tied" marked **misread** (amber), "and" marked **skipped** (red), the rest green, and everything after "it." **not reached**.

Then answer the comprehension question out loud, for example "A white bird".

## Oral Exam (Pro)

Topic "The water cycle". Answer the questions like a child would: get the first one right ("The water goes up into the sky when the sun heats it"), half-answer the next ("it makes rain?") and get one wrong ("evaporation is the same as boiling"). The summary should show where understanding broke down.

## Home Language (Pro)

With `page_story.jpg` scanned, choose Bangla and ask: "নদীটা কেন চকচক করছিল?" ("Why was the river shining?").

## Note on demo data mode

With **Use demo data** on (or without a model), the app returns built-in sample answers and ignores what is actually in the photo. Run with the real model to see these files actually read.
