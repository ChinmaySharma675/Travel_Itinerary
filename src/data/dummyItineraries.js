const dummyItineraries = [
    {
        title: "Sightseeing in Paris",
        itinerary: [
            {
                name: "Eiffel Tower",
                description: "Visit the iconic Eiffel Tower.",
                image: "https://upload.wikimedia.org/wikipedia/commons/a/a8/Tour_Eiffel_Wikimedia_Commons.jpg",
                location: { lat: 48.8584, lng: 2.2945, label: "Eiffel Tower" }
            },
            {
                name: "Seine River",
                description: "Walk along the scenic Seine River.",
                image: "https://upload.wikimedia.org/wikipedia/commons/6/6d/Seine_River_Paris_2017.jpg",
                location: { lat: 48.8566, lng: 2.3522, label: "Seine River" }
            },
            {
                name: "Louvre Museum",
                description: "Explore the world-famous Louvre Museum.",
                image: "https://upload.wikimedia.org/wikipedia/commons/4/4b/Louvre_Museum_Wikimedia_Commons.jpg",
                location: { lat: 48.8606, lng: 2.3376, label: "Louvre Museum" }
            }
        ]
    },
    {
        title: "Rome Adventures",
        itinerary: [
            {
                name: "Colosseum",
                description: "Step back in time at the Colosseum.",
                image: "https://upload.wikimedia.org/wikipedia/commons/d/de/Colosseo_2020.jpg",
                location: { lat: 41.8902, lng: 12.4922, label: "Colosseum" }
            },
            {
                name: "Vatican City",
                description: "Visit Vatican City landmarks.",
                image: "https://upload.wikimedia.org/wikipedia/commons/8/8a/Vatican_City_Saint_Peter.jpg",
                location: { lat: 41.9029, lng: 12.4534, label: "Vatican City" }
            },
            {
                name: "Piazza Navona",
                description: "Enjoy the lively Piazza Navona.",
                image: "https://upload.wikimedia.org/wikipedia/commons/c/cf/Piazza_Navona_Rome.jpg",
                location: { lat: 41.8992, lng: 12.4731, label: "Piazza Navona" }
            }
        ]
    },
    {
        title: "London Highlights",
        itinerary: [
            {
                name: "Big Ben",
                description: "See the iconic Big Ben clock tower.",
                image: "https://upload.wikimedia.org/wikipedia/commons/3/3e/Big_Ben_2012.jpg",
                location: { lat: 51.5007, lng: -0.1246, label: "Big Ben" }
            },
            {
                name: "Thames River",
                description: "Walk along the Thames river.",
                image: "https://upload.wikimedia.org/wikipedia/commons/5/53/Thames_River_London.jpg",
                location: { lat: 51.5074, lng: -0.1278, label: "Thames River" }
            },
            {
                name: "British Museum",
                description: "Explore historical artifacts at the British Museum.",
                image: "https://upload.wikimedia.org/wikipedia/commons/1/1d/British_Museum_interior.jpg",
                location: { lat: 51.5194, lng: -0.1270, label: "British Museum" }
            }
        ]
    }
];

export default dummyItineraries;
