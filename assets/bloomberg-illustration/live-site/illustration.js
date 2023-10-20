
// const headlines = [
//   "Unbelievable: <br>Climate Change Strikes Again!",
//   "Shocking New Twist in <br>Climate Change Story!",
//   "Climate Change's Latest Surprise <br>Leaves Experts Stunned!",
//   "Incredible Developments<br> in the Climate Change Saga!",
//   "You Won't Believe the Latest <br>Climate Change Revelation!",
//   "Climate Change's Unexpected Move Sparks Controversy!",
//   "Mind-Blowing Climate Change Event Takes Everyone by Surprise!",
//   "Breaking News: Climate Change's Astonishing Impact!",
//   "Climate Change's Latest Move Baffles Scientists!",
//   "Unprecedented Climate Change Event Rocks the World! \xa0 ",
// ];
const headlines = [
  ["Unbelievable: Climate Change Strikes Again!", "Unbelievable: <br>Climate Change <br>Strikes Again!"],
  ["Shocking New Twist in Climate Change Story!", "Shocking New Twist in <br>Climate Change Story!", "Shocking! <br>New Twist in <br>Climate Change <br>Story!"],
  ["Climate Change\u{2019}s Latest Surprise Leaves Experts Stunned!", "Climate Change\u{2019}s Latest Surprise <br>Leaves Experts Stunned!", "Climate Change\u{2019}s <br>Latest Surprise <br>Leaves Experts <br>Stunned!"],
  ["Incredible Developments in the Climate Change Saga!", "Incredible Developments in the <br>Climate Change Saga!", "Incredible <br>Developments in <br>the Climate <br>Change Saga!"],
  ["You Won\u{2019}t Believe the Latest Climate Change Revelation!", "You Won\u{2019}t Believe the Latest <br>Climate Change Revelation!", "You Won\u{2019}t Believe <br>the Latest <br>Climate Change <br>Revelation!"],
  ["Climate Change\u{2019}s Unexpected Move Sparks Controversy!", "Climate Change\u{2019}s Unexpected Move <br>Sparks Controversy!", "Climate Change\u{2019}s <br>Unexpected Move <br>Sparks Controversy!"],
  ["Mind-Blowing Climate Change Event Takes Everyone by Surprise!", "Mind-Blowing Climate Change Event <br>Takes Everyone by Surprise!", "Mind-Blowing <br>Climate Change <br>Event Takes Every- <br>one by Surprise!"],
  ["Breaking News: Climate Change\u{2019}s Astonishing Impact!", "Breaking News:<br>Climate Change\u{2019}s Astonishing Impact!", "Breaking News: <br>Climate Change\u{2019}s<br>Astonishing Impact!", "Breaking News: <br>Climate <br>Change\u{2019}s<br>Astonishing <br>Impact!"],
  ["Climate Change\u{2019}s Latest Move Baffles Scientists!","Climate Change\u{2019}s Latest Move<br>Baffles Scientists!","Climate Change\u{2019}s<br>Latest Move<br>Baffles Scientists!", "Climate<br>Change\u{2019}s<br>Latest Move<br>Baffles<br>Scientists!"],
  ["Unprecedented Climate Change Event Rocks the World!", "Unprecedented Climate Change Event<br>Rocks the World!", "Unprecedented<br>Climate Change Event<br>Rocks the World!"],
  ["Climate <br>Change?$", "Climate <br>Change$"],
  ["Climate <br>Change<br>Did It!$", "Climate <br>Change$"]
];




let lastTime = 0;
let mystring;
let startX, startY;
let totalDistance = 0;
let myTextSize = 48;
let spurtDistance;
let sensitivity; //higher is slower

if (window.innerWidth > 800) {
  spurtDistance = window.innerHeight/5;
  sensitivity = 140;
  startX = window.innerWidth/2;
  startY = window.innerHeight*.65;
} else {
  spurtDistance = window.innerHeight/9;
  sensitivity = 70;
  startX = window.innerWidth/2;
  startY = window.innerHeight*.5;
}



const typefaces = [
  ["franklin-gothic-urw-comp", "normal"],
  ["rockwell-nova-condensed", "normal"],
  ["acumin-pro", "normal"],
  ["acumin-pro-condensed", "italic"]
];

const alignments = [
  "start",
  // "end",
  "center"
];

const textColors = [
  "yellow",
  "#ffffff",
];

const bgColors = [
  "blue",
  "red"
  ,"black"
];







const pointer = document.getElementById("pointer");
moveMouse();



const container = document.getElementById("container");


function createHeadline(x, y, moveX, moveY, scrll) {
  let randomIndex = Math.floor(Math.random() * headlines.length);
  let randomHeadline = headlines[randomIndex][Math.floor(Math.random()*headlines[randomIndex].length)];
  if (window.innerWidth <= 800) {
    randomHeadline = headlines[randomIndex][Math.floor(Math.random() * (headlines[randomIndex].length-1) + 1)];  //prevents headlines with no line breaks on mobile
  }
  

  

  const headlineElement = document.createElement("div");
  headlineElement.className = "headline";
  headlineElement.innerHTML = randomHeadline;
  container.appendChild(headlineElement);
  headlineElements.push(headlineElement);

  // delete oldest headline when too many
  if (headlineElements.length >40) {
    headlineElements[0].remove();
    headlineElements.splice(0, 1);
  }

  let headlineX = x;
  let headlineY = y+scrll;

  // positions text at CENTER of cursor
  headlineElement.style.transform = `translate(calc(-50% + ${headlineX}px), calc(-50% + ${headlineY}px)) scale(.3)`;
  // randomize upper case
  if (Math.random() > .5) {randomHeadline = randomHeadline.toUpperCase();}
  let fontIndex = Math.floor(Math.random() * typefaces.length);
  headlineElement.style.fontFamily = typefaces[fontIndex][0];
  headlineElement.style.fontStyle = typefaces[fontIndex][1];
  let size = Math.random()*2.5+4.5;
  headlineElement.style.fontSize = size + "vh";
  headlineElement.style.letterSpacing = map(size, 3, 8, -.05, -.3) + "vh";
  headlineElement.style.lineHeight = map(size, 3, 8, 95, 85) + "%";
  headlineElement.style.color = textColors[Math.floor(Math.random() * textColors.length)];
  headlineElement.style.backgroundColor = bgColors[Math.floor(Math.random() * bgColors.length)];
  headlineElement.style.textAlign = alignments[Math.floor(Math.random() * alignments.length)];

  // makes headlines that contain a dollar sign huge
  if (randomHeadline.includes("$")) {
    headlineElement.innerHTML = randomHeadline.replace("$", "");
    size = Math.random()*9+14;
    headlineElement.style.fontSize = size + "vh";
    headlineElement.style.letterSpacing = map(size, 10, 25, -.4, -.9) + "vh";
    headlineElement.style.lineHeight = map(size, 10, 25, 85, 80) + "%";
  }

  // creates "spurt" motion
  const length = Math.sqrt(moveX * moveX + moveY * moveY);
  const deltaX = (moveX / length) * spurtDistance;
  const deltaY = (moveY / length) * spurtDistance;

  setTimeout(() => {
    if (window.innerWidth > 800){
      headlineElement.style.transform = `translate(calc(-50% + ${headlineX+deltaX}px), calc(-50% + ${headlineY+deltaY}px)) scale(.9)`;
    } else {
      headlineElement.style.transform = `translate(calc(-50% + ${headlineX+deltaX}px), calc(-50% + ${headlineY+deltaY}px)) scale(.65)`;
    }
  });
}






container.addEventListener("mousemove", (e) => {
  // tracking distance
  let d = Math.sqrt((startX - e.clientX)**2 + (startY - e.clientY)**2);
  totalDistance += d;
  if(totalDistance>350) {
    totalDistance = 0;
    createHeadline(e.clientX, e.clientY, e.movementX, e.movementY, scrollY);
  }
  startX = e.clientX;
  startY = e.clientY;
  moveMouse();

});


var headlineCounter = 0;
let headlineElements = [];
var scroll = 0;
var lastScroll = 0;

document.addEventListener("scroll", (e) => {
  moveMouse();
  // tracking distance
  scroll += Math.abs(scrollY-lastScroll);
  lastScroll = scrollY;
  if (scroll/sensitivity > headlineCounter) {
    createHeadline(startX, startY, Math.random()-.5, Math.random()-.5, scrollY);
    headlineCounter++;
  }
});

function moveMouse() {
  pointer.style.left = startX +"px";
  pointer.style.top = startY+scrollY +"px";
}

function map(value, low1, high1, low2, high2) {
  return low2 + (high2 - low2) * (value - low1) / (high1 - low1);
}