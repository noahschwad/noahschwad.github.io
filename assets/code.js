document.addEventListener("DOMContentLoaded", function() {
  const carousels = document.querySelectorAll(".carousel");

  carousels.forEach(function(carousel) {
    const container = carousel.querySelector(".carousel-container");
    const slides = container.getElementsByClassName("slide");
    const indicator = carousel.parentNode.querySelector(".carousel-indicator");
    let currentSlide = 0;
    let smallprojects = false;
    // console.log(carousel.parentElement.parentElement.getElementsByClassName('subdescription')[0]);
    if (carousel.parentElement.getElementsByClassName('subdescription')[0]) {//if it has a subdescription, declare a variable called subprojects
      smallprojects = true;
      const subdescriptions = document.getElementsByClassName("subdescription");
    }
    let touchstartX = 0;


		function showSlide(index) {
			container.style.transform = `translateX(-${index * 100}%)`;
			indicator.querySelector(".current-slide").textContent = index + 1;
		
			// Show/hide subdescriptions if relevant
			if (smallprojects) {
				for (let subdescription of subdescriptions) {
					subdescription.style.display = "none";
				}
				subdescriptions[index].style.display = "block";
			}
		
			// Pause all videos and reset them
			for (let i = 0; i < slides.length; i++) {
				const video = slides[i].querySelector("video");
				if (video) {
					if (i === index) {
						video.load(); // start loading now
						video.play().catch(() => {}); // safe catch for autoplay fail
						const nextSlide = slides[index + 1];
						if (nextSlide) {
							const nextVideo = nextSlide.querySelector("video");
							if (nextVideo && nextVideo.preload !== "auto") {
								nextVideo.preload = "auto";
								nextVideo.load();
							}
						}
					} else {
						video.pause();
						// video.currentTime = 0;
					}
				}
			}
		}
		

    function animateSlide() {
      container.classList.add("slide-animation");
      setTimeout(function() {
        container.classList.remove("slide-animation");
      }, 400); // Adjust the duration (in milliseconds) to match your transition duration
    }

    function nextSlide() {
      currentSlide = (currentSlide + 1) % slides.length;
      animateSlide();
      showSlide(currentSlide);
    }

    function prevSlide() {
      currentSlide = (currentSlide - 1 + slides.length) % slides.length;
      animateSlide();
      showSlide(currentSlide);
    }

    carousel.addEventListener("click", function(event) {
      const clickX = event.clientX - event.target.getBoundingClientRect().left;
      const halfWidth = event.target.offsetWidth / 2;
      if (clickX > halfWidth) {
        nextSlide();
      } else {
        prevSlide();
      }
    });


    // make array of descriptions
    var subdescriptions = document.getElementsByClassName("subdescription");

    var subdescriptionContainer = document.getElementById("subdescription-container");


    //------ swipe controls -------
    // gets triggered when zooming on mobile >:(
    // carousel.addEventListener("touchstart", function(event) {
    //   touchstartX = event.touches[0].clientX;
    // });

    // carousel.addEventListener("touchend", function(event) {
    //   const touchendX = event.changedTouches[0].clientX;
    //   const deltaX = touchendX - touchstartX;
    //   const sensitivity = 100;
    //   if (deltaX > sensitivity) {
    //     prevSlide();
    //   } else if (deltaX < -sensitivity) {
    //     nextSlide();
    //   }
    // });

    showSlide(currentSlide);
    indicator.querySelector(".total-slides").textContent = slides.length;
  });
});






//--------- carousel hover arrows --------------

var is_touch_device = 'ontouchstart' in document.documentElement;


function updateCursorPosition(event) {
  if (!is_touch_device) {
    const div = event.target;
    const rect = div.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;

    const customCursorLeft = document.getElementById("customCursorLeft");
    const customCursorRight = document.getElementById("customCursorRight");

    // Calculate the position of the mouse relative to the center of the div
    const distanceFromCenter = mouseX - div.offsetWidth / 2;

    if (distanceFromCenter < 0) {
      // Mouse is on the left half of the div
      customCursorLeft.style.display = "block";
      customCursorRight.style.display = "none";
    } else {
      // Mouse is on the right half of the div
      customCursorLeft.style.display = "none";
      customCursorRight.style.display = "block";
    }

    // Update the custom cursor positions
    customCursorLeft.style.left = event.clientX - customCursorLeft.width / 2 + "px";
    customCursorLeft.style.top = event.clientY - customCursorLeft.height / 2 + "px";
    customCursorRight.style.left = event.clientX - customCursorRight.width / 2 + "px";
    customCursorRight.style.top = event.clientY - customCursorRight.height / 2 + "px";
  }
}

function hideCustomCursor() {
  if (!is_touch_device) {
    const customCursorLeft = document.getElementById("customCursorLeft");
    const customCursorRight = document.getElementById("customCursorRight");
    customCursorLeft.style.display = "none";
    customCursorRight.style.display = "none";
  }
}