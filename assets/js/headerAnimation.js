// header isnt fixed by default
document.getElementById("headerBox").style.position = "fixed";
document.getElementsByTagName("header")[0].style.position = "fixed";


scrollFunction();

window.onscroll = function() {scrollFunction()};

function scrollFunction() {
  if (document.body.scrollTop > -10 || document.documentElement.scrollTop > -10) { // the -10 values used to be 30. also need to turn transitions back on for a few styles to have old functionality

    document.getElementById("headerBox").classList.add("fullHeddrBox");
    document.getElementsByTagName("header")[0].classList.add("fullHeader");
    document.getElementsByTagName("header")[0].style.top = "0px";
    document.getElementsByTagName("header")[0].style.height = "60px";
    document.getElementsByTagName("ul")[0].style.right = "-1px";



  } else {

    document.getElementById("headerBox").classList.remove("fullHeddrBox");
    document.getElementsByTagName("header")[0].classList.remove("fullHeader");
    document.getElementsByTagName("header")[0].style.top = "25px";
    document.getElementsByTagName("header")[0].style.height = "70px";
    document.getElementsByTagName("ul")[0].style.right = "13px";




  }
}
