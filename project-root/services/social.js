import fetch from 'node-fetch';

/**
 * Post a message to selected social network
 */
export async function postToSocial(platform, message, link) {
    switch(platform) {
        case "twitter":
            await fetch("https://api.twitter.com/2/tweets", {
                method: "POST",
                headers: { 
                    Authorization: `Bearer ${process.env.TWITTER_TOKEN}`,
                    "Content-Type": "application/json" 
                },
                body: JSON.stringify({ text: `${message} ${link}` })
            });
            break;
        // Add other platforms (LinkedIn, Facebook) here
    }
}
