function uuidv4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    var r = (Math.random() * 16) | 0,
      v = c == "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function fetchArkoseToken() {
  try {
    const response = await fetch("https://arkose-bypass-api.vercel.app/api/token");
    if (response.ok) {
      const data = await response.json();
      return data.token;
    } else {
      throw new Error(`Failed to fetch data. Status: ${response.status}`);
    }
  } catch (err) {
    console.error(err);
    return undefined;
  }

 
}

const accessTokenCache = new Map();

async function getAccessToken() {
  if (accessTokenCache.has("accessToken")) {
    return accessTokenCache.get("accessToken");
  }

  const resp = await fetch("https://chat.openai.com/api/auth/session");

  if (resp.status === 403) {
    throw new Error("CLOUDFLARE");
  }

  if (!resp.ok) {
    throw new Error(resp.statusText);
  }

  const data = await resp.json();

  if (!data.accessToken) {
    throw new Error("UNAUTHORIZED");
  }

  accessTokenCache.set("accessToken", data.accessToken);
  return data.accessToken;
}

function data_to_text(data) {
  // console.log("Inside data to text", data);
  try {
    let temp = data.split("\n\n");
    console.log(temp, "temp as array");
    temp = temp[temp.length - 4];
    temp = temp.slice(6);
    temp = temp.replace(/(\r\n|\n|\r)/gm, "");

    console.log(temp, "temp");

    const json_data = JSON.parse(temp);
    const text = json_data.message.content.parts[0];
    const conversationId = json_data.conversation_id;

    return {
      text: text,
      conversationId: conversationId,
    };
  } catch (error) {
    console.log(`Error in data retrieved!\n${error.message}`);
    return {
      text: "UNKNOWNERROR",
      conversationId: "some-random-id",
    };
  }
}

async function generateAnswer(question) {




  console.log("in generate answer fn");
  try {
    const accessToken = await getAccessToken();
    const arkoseToken =await fetchArkoseToken()
    console.log({arkoseToken})
    console.log({ accessToken });

    const payload = {
      action: "next",
      messages: [
        {
          id: uuidv4(),
          author: { role: "user" },
          content: { content_type: "text", parts: [question] },
          metadata: {},
        },
      ],
      parent_message_id: uuidv4(),
      model: "text-davinci-002-render-sha",
      timezone_offset_min: 420,
      suggestions: [
        "Tell me a random fun fact about the Roman Empire",
        "Explain options trading in simple terms if I'm familiar with buying and selling stocks.",
        "What are some reasons why my linked list would appear empty after I tried reversing it?",
        "Compare storytelling techniques in novels and in films in a concise table across different aspects",
      ],
      history_and_training_disabled: false,
      arkose_token:arkoseToken,
      conversation_mode: { kind: "primary_assistant" },
      force_paragen: false,
      force_rate_limit: false,
    };

    console.log(payload)
    

    const resp = await fetch(
      "https://chat.openai.com/backend-api/conversation",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      }
    ).catch((e) => console.log("error in gpt fetch...", e));

    console.log(resp, "RES");

    const string_data = await resp.text();
    console.log(string_data, "str data");
    // console.log(string_data);

    if (string_data.includes("Only one message at a time.")) {
      return "MULTIPLE_REQUESTS";
    }
    if (
      string_data.includes("Too many requests in 1 hour") ||
      string_data.includes("You've reached our limit of messages per hour")
    ) {
      return "RATE_LIMITED";
    }
    if (string_data.includes("We're currently processing too many requests.")) {
      return "SERVER_OVERLOADED";
    }
    if (!resp.ok) {
      throw new Error(resp.status);
    }

    const data = data_to_text(string_data);

    delete_chat(data.conversationId, accessToken);

    return data?.text;
  } catch (error) {
    if (error.message === "CLOUDFLARE") {
      accessTokenCache.delete("accessToken");
      return "CAPTCHA_ERROR";
    } else if (error.message === "UNAUTHORIZED") {
      accessTokenCache.delete("accessToken");
      return "NOT_LOGGED_IN_CHATGPT";
    } else if (error.message === "413") {
      return "MESSAGE_TOO_LONG";
    } else if (error.message === "401") {
      accessTokenCache.delete("accessToken");
      return "CHATGPT_LOGIN_EXPIRED";
    } else {
      console.error(error);
      accessTokenCache.delete("accessToken");
      return "ERROR-" + error.message;
    }
  }
}

async function delete_chat(conversationId, accessToken) {
  try {
    fetch(
      `https://chat.openai.com/backend-api/conversation/${conversationId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          is_visible: false,
        }),
      }
    );
  } catch (error) {
    console.log(error);
  }
}

//listen for ask-chatgpt message
chrome.runtime.onMessage.addListener(async function (
  request,
  sender,
  sendResponse
) {
  console.log("background.js received message");
  if (request.message === "ask-chatgpt") {
   const response = await generateAnswer("Say your servers are up and running in a funny way")
    console.log(response);
    sendResponse({ response: response });
  }
  return true;
});
