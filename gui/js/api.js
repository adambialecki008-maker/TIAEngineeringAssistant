export async function getJson(
    url
) {
    const response =
        await fetch(url);


    const data =
        await response.json();


    if (!response.ok) {
        throw new Error(
            getErrorMessage(data)
        );
    }


    return data;
}


export async function postJson(
    url,
    payload
) {
    const response =
        await fetch(
            url,
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json",
                },

                body:
                    JSON.stringify(
                        payload
                    ),
            }
        );


    const data =
        await response.json();


    if (!response.ok) {
        throw new Error(
            getErrorMessage(data)
        );
    }


    return data;
}


function getErrorMessage(
    data
) {
    if (
        data
        &&
        typeof data.detail === "string"
    ) {
        return data.detail;
    }


    return JSON.stringify(
        data
    );
}